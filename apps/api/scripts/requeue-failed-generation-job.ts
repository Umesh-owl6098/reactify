/**
 * Requeue a failed generation job without re-uploading the image.
 */
import { PrismaClient } from "@prisma/client";
import { validateEnv } from "../src/env.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { createJobServices } from "../src/jobs/index.js";
import { createPipelineServices } from "../src/pipeline/index.js";
import { createScriptStores } from "./lib/script-storage.js";
import { initializePersistence } from "../src/persistence/initialize.js";
import { getPrismaClient } from "../src/persistence/client.js";
import { resolveOperationAIConfig, resolveUsageProviderName } from "../src/providers/ai-provider-config.js";

const GENERATION_ID = process.argv[2] ?? "95d76f53-384d-4c49-9400-c1c0a3553ad2";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const { imageStorage } = createScriptStores(env);
  const pipeline = createPipelineServices(imageStorage, { env });
  const prisma = getPrismaClient(env);
  await initializePersistence(env, pipeline.store);

  const generation = await prisma.generation.findUnique({ where: { id: GENERATION_ID } });
  if (!generation) {
    throw new Error(`Generation ${GENERATION_ID} not found`);
  }

  const job = await prisma.backgroundJob.findFirst({
    where: { generationId: GENERATION_ID, jobType: "design_analysis" },
    orderBy: { createdAt: "asc" },
  });

  if (!job) {
    throw new Error("Design analysis job not found");
  }

  console.log("before", {
    generationStatus: generation.status,
    jobStatus: job.status,
    attemptNumber: job.attemptNumber,
    payload: job.payload,
  });

  await prisma.usageReservation.deleteMany({ where: { jobId: job.id } });

  await prisma.$transaction([
    prisma.generation.update({
      where: { id: GENERATION_ID },
      data: {
        status: "Analyzing",
        currentStage: "design_analysis",
        failStage: null,
        failureCode: null,
        failureMessage: null,
        errors: [],
        analysisMetadata: null,
        outputsDesignAnalysis: null,
      },
    }),
    prisma.pipelineStageRecord.deleteMany({
      where: { generationId: GENERATION_ID, stageName: "design_analysis", status: "failed" },
    }),
    prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "queued",
        attemptNumber: 0,
        progress: 0,
        progressMessage: "Queued",
        failureCode: null,
        failureMessage: null,
        failedAt: null,
        completedAt: null,
        result: null,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        availableAt: new Date(),
      },
    }),
  ]);

  const { usageService } = createJobServices(prisma, env, {
    store: pipeline.store,
    runner: pipeline.runner,
    editService: {} as never,
    exportService: {} as never,
    visualComparisonService: {} as never,
  });

  if (usageService?.isMeteredJobType("design_analysis")) {
    const aiConfig = resolveOperationAIConfig(env, "design_analysis");
    await usageService.reserveForJob({
      ownerId: generation.ownerId,
      generationId: GENERATION_ID,
      jobId: job.id,
      operationType: "design_analysis",
      attemptNumber: 1,
      provider: resolveUsageProviderName(env),
      model: aiConfig.model,
      estimate: {
        operationType: "design_analysis",
        maxOutputTokens: aiConfig.maxTokens,
      },
    });
  }

  const after = await prisma.generation.findUnique({ where: { id: GENERATION_ID } });
  const refreshedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
  const reservation = await prisma.usageReservation.findFirst({
    where: { jobId: job.id, attemptNumber: 1 },
    orderBy: { createdAt: "desc" },
  });

  console.log(
    JSON.stringify(
      {
        generationId: GENERATION_ID,
        jobId: job.id,
        generationStatus: after?.status,
        jobStatus: refreshedJob?.status,
        payload: refreshedJob?.payload,
        reservationStatus: reservation?.status ?? null,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
