/**
 * Creates a generation and traces background job + worker pipeline state.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { buildServer } from "../src/server.js";
import { buildWorker } from "../src/worker-bootstrap.js";
import { registerTestUser } from "../src/test/authHelpers.js";
import { createAuthenticatedTestImage, PNG_1X1, testEnv } from "../src/test/helpers.js";
import { getPrismaClient } from "../src/persistence/client.js";
import { validateEnv } from "../src/env.js";
import { logDatabaseIdentity } from "../src/lib/database-identity.js";

const TERMINAL_JOB_STATUSES = new Set([
  "completed",
  "failed",
  "dead_letter",
  "cancelled",
  "waiting_for_client",
]);

async function snapshot(prisma: PrismaClient, generationId: string) {
  const generation = await prisma.generation.findUnique({ where: { id: generationId } });
  const jobs = await prisma.backgroundJob.findMany({
    where: { generationId },
    orderBy: { createdAt: "asc" },
  });
  const reservations = jobs.length
    ? await prisma.usageReservation.findMany({
        where: { jobId: { in: jobs.map((job) => job.id) } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return {
    generation: generation
      ? {
          id: generation.id,
          status: generation.status,
          failureCode: generation.failureCode,
          failureMessage: generation.failureMessage,
          activeStage: generation.activeStage,
        }
      : null,
    jobs: jobs.map((job) => ({
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      failureCode: job.failureCode,
      failureMessage: job.failureMessage,
      attemptNumber: job.attemptNumber,
      lockedBy: job.lockedBy,
      availableAt: job.availableAt.toISOString(),
      createdAt: job.createdAt.toISOString(),
    })),
    reservations: reservations.map((reservation) => ({
      id: reservation.id,
      jobId: reservation.jobId,
      status: reservation.status,
      attemptNumber: reservation.attemptNumber,
    })),
  };
}

function isTraceComplete(state: Awaited<ReturnType<typeof snapshot>>): boolean {
  if (state.generation?.status === "Failed") {
    return true;
  }

  if (state.jobs.length === 0) {
    return false;
  }

  return state.jobs.every((job) => TERMINAL_JOB_STATUSES.has(job.status));
}

async function cleanupGeneration(prisma: PrismaClient, generationId: string): Promise<void> {
  const jobIds = (
    await prisma.backgroundJob.findMany({ where: { generationId }, select: { id: true } })
  ).map((job) => job.id);

  if (jobIds.length > 0) {
    await prisma.usageReservation.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.backgroundJob.deleteMany({ where: { generationId } });
  }

  await prisma.generation.deleteMany({ where: { id: generationId } });
}

async function main() {
  process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
  loadLocalEnv();
  const env = validateEnv({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? testEnv.DATABASE_URL.replace("_test", ""),
  });
  const prisma = getPrismaClient(env);

  console.info({ event: "trace_started", aiProvider: env.AI_PROVIDER, inlineExecution: env.JOB_INLINE_EXECUTION });
  await logDatabaseIdentity(prisma, env.DATABASE_URL, "trace-script");

  const { runner, shutdown, paths } = await buildWorker(env);
  runner.start();

  const { app } = await buildServer(env, { storageDir: paths.imageStorageDir, enablePersistence: true, startWorker: false });
  const auth = await registerTestUser(app, {
    email: `trace-${randomUUID()}@example.com`,
    password: "secure-password-123",
    displayName: "Trace User",
  });

  let generationId: string | undefined;

  try {
    const imageId = await createAuthenticatedTestImage(app, auth.cookie, PNG_1X1);
    console.info({ event: "upload_complete", imageId });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      headers: { cookie: auth.cookie },
      payload: { imageId },
    });

    console.info({
      event: "generation_create_response",
      statusCode: response.statusCode,
      body: response.body,
    });

    if (response.statusCode !== 202) {
      throw new Error(`Expected 202 from generation create, got ${response.statusCode}: ${response.body}`);
    }

    const body = response.json() as { generationId: string; job?: { jobId: string; status: string } };
    generationId = body.generationId;
    console.info({
      event: "generation_created",
      generationId,
      jobId: body.job?.jobId,
      jobStatus: body.job?.status,
    });

    let finalState: Awaited<ReturnType<typeof snapshot>> | null = null;

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const state = await snapshot(prisma, generationId);
      console.info({ event: "trace_poll", attempt, ...state });

      if (isTraceComplete(state)) {
        finalState = state;
        console.info({ event: "trace_finished", generationId, finalState: state });
        break;
      }

      await sleep(1000);
    }

    if (!finalState) {
      throw new Error(`Timed out waiting for generation ${generationId} jobs to finish`);
    }
  } finally {
    await app.close();
    await runner.stop();
    if (generationId) {
      await cleanupGeneration(prisma, generationId);
    }
    await shutdown();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error({
    event: "trace_failed",
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  });
  process.exit(1);
});
