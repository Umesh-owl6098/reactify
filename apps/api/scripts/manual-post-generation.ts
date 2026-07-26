import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testEnv, PNG_1X1, createAuthenticatedTestImage } from "../src/test/helpers.js";
import { buildServer } from "../src/server.js";
import { registerTestUser } from "../src/test/authHelpers.js";
import { getPrismaClient } from "../src/persistence/client.js";

async function main() {
  process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
  const storageDir = await mkdtemp(join(tmpdir(), "reactify-manual-enqueue-"));
  const env = { ...testEnv, DATABASE_URL: process.env.DATABASE_URL ?? testEnv.DATABASE_URL.replace("_test", "") };

  const { app } = await buildServer(env, {
    storageDir,
    enablePersistence: true,
  });

  const auth = await registerTestUser(app, {
    email: `manual-enqueue-${randomUUID()}@example.com`,
    password: "secure-password-123",
    displayName: "Manual Enqueue",
  });

  try {
    const imageId = await createAuthenticatedTestImage(app, auth.cookie, PNG_1X1);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      headers: { cookie: auth.cookie },
      payload: { imageId },
    });

    console.log("POST /generations status:", response.statusCode);
    console.log("POST /generations body:", response.body);

    if (response.statusCode !== 202) {
      process.exit(1);
    }

    const body = response.json() as { generationId: string; job?: { jobId: string; jobType: string; status: string } };
    const prisma = getPrismaClient(env);
    const [generation, jobs] = await Promise.all([
      prisma.generation.findUnique({ where: { id: body.generationId } }),
      prisma.backgroundJob.findMany({ where: { generationId: body.generationId } }),
    ]);

    console.log("\nDatabase state:");
    console.log("- Generation.status:", generation?.status);
    console.log("- Generation.failureCode:", generation?.failureCode);
    console.log("- BackgroundJob count:", jobs.length);
    console.log("- BackgroundJob rows:", jobs.map((job) => ({ id: job.id, status: job.status, jobType: job.jobType })));

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${body.generationId}`,
      headers: { cookie: auth.cookie },
    });
    const statusBody = statusResponse.json() as { status: string };
    console.log("\nGET /generations/:id status:", statusBody.status);

    await prisma.backgroundJob.deleteMany({ where: { generationId: body.generationId } });
    await prisma.generation.delete({ where: { id: body.generationId } });
    await prisma.$disconnect();

    if (jobs.length === 0 || generation?.status === "Failed") {
      process.exit(1);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
