/**
 * Manual verification for generation 76825ff8 retry after persist-before-enqueue fix.
 */
import { validateEnv } from "../src/env.js";
import { createScriptStores } from "./lib/script-storage.js";
import { createJobServices } from "../src/jobs/index.js";
import { recoverFailedGeneration } from "../src/jobs/generation-recovery.js";
import { initializePersistence } from "../src/persistence/initialize.js";
import { getPrismaClient } from "../src/persistence/client.js";
import { createPipelineServices } from "../src/pipeline/index.js";

const GENERATION_ID = "76825ff8-3eef-4202-9370-e8fd3b290742";

async function main() {
  const env = validateEnv();
  const { imageStorage } = createScriptStores(env);
  const pipeline = createPipelineServices(imageStorage, { env });
  const prisma = getPrismaClient(env);

  await initializePersistence(env, pipeline.store);

  const row = await prisma.generation.findUnique({ where: { id: GENERATION_ID } });
  if (!row) {
    console.error("Generation not found in database:", GENERATION_ID);
    process.exit(1);
  }

  const record = pipeline.store.getIncludingDeleted(GENERATION_ID);
  if (!record) {
    pipeline.store.hydrate([
      {
        id: row.id,
        ownerId: row.ownerId,
        imageId: row.sourceImageId,
        projectId: row.projectId,
        status: row.status as typeof record extends undefined ? never : NonNullable<typeof record>["status"],
        activeStage: row.currentStage as NonNullable<typeof record>["activeStage"],
        stages: [],
        outputs: {
          designAnalysis: row.outputsDesignAnalysis as never,
          generationPlan: row.outputsGenerationPlan as never,
          generatedProject: null,
        },
        analysis: row.analysisMetadata as never,
        plan: row.planMetadata as never,
        project: row.projectMetadata as never,
        schemaValidation: row.schemaValidation as never,
        staticValidation: row.staticValidation as never,
        sandboxValidation: row.sandboxValidation as never,
        projectHash: row.latestProjectHash,
        validationReportFingerprint: row.validationReportFingerprint,
        repairRequired: row.repairRequired,
        repairStatus: row.repairStatus as NonNullable<typeof record>["repairStatus"],
        currentRepairAttempt: row.currentRepairAttempt,
        maxRepairAttempts: row.maxRepairAttempts,
        repairAttempts: [],
        repairInProgress: row.repairInProgress,
        manualRetryAllowed: row.manualRetryAllowed,
        editedByUser: row.editedByUser,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        awaitingPlanConfirmation: row.awaitingPlanConfirmation,
        awaitingSandboxValidation: row.awaitingSandboxValidation,
        pipelineState: row.pipelineState as never,
        resumeInProgress: row.resumeInProgress,
        sandboxResumeInProgress: row.sandboxResumeInProgress,
        errors: (row.errors as NonNullable<typeof record>["errors"]) ?? [],
        cancelled: row.cancelled,
        failStage: row.failStage as NonNullable<typeof record>["failStage"],
        exports: [],
        exportInProgress: row.exportInProgress,
        versions: [],
        activeVersionId: row.activeVersionId,
        edits: [],
        editInProgress: row.editInProgress,
        activeEditId: row.activeEditId,
        rollbackInProgress: row.rollbackInProgress,
        visualComparisons: [],
        visualComparisonInProgress: row.visualComparisonInProgress,
        activeComparisonId: row.activeComparisonId,
        visualCorrectionInProgress: row.visualCorrectionInProgress,
        visualCorrectionAttempt: row.visualCorrectionAttempt,
        visualCorrectionMaxAttempts: row.visualCorrectionMaxAttempts,
        previewCaptureRequired: row.previewCaptureRequired,
        pendingVisualRecomparison: row.pendingVisualRecomparison as never,
        stateVersion: row.stateVersion,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    ]);
  }

  const hydrated = pipeline.store.get(GENERATION_ID);
  if (!hydrated) {
    console.error("Failed to hydrate generation into store");
    process.exit(1);
  }

  const { jobService } = createJobServices(prisma, env, {
    store: pipeline.store,
    runner: pipeline.runner,
    editService: {} as never,
    exportService: {} as never,
    visualComparisonService: {} as never,
  });

  console.log("Before retry:", {
    status: hydrated.status,
    failureCode: hydrated.errors.at(-1)?.code,
    manualRetryAllowed: hydrated.manualRetryAllowed,
  });

  const result = await recoverFailedGeneration({
    record: hydrated,
    store: pipeline.store,
    jobService,
    imageStorage: storage,
    ownerId: hydrated.ownerId,
  });

  console.log("Recovery result:", result);

  const jobs = await prisma.backgroundJob.findMany({ where: { generationId: GENERATION_ID } });
  const reservations = await prisma.usageReservation.findMany({
    where: { jobId: { in: jobs.map((job) => job.id) } },
  });
  const refreshed = pipeline.store.get(GENERATION_ID);

  console.log("After retry:", {
    status: refreshed?.status,
    failureCode: refreshed?.errors.at(-1)?.code,
    backgroundJobs: jobs.map((job) => ({ id: job.id, status: job.status, jobType: job.jobType })),
    reservations: reservations.length,
  });

  await prisma.$disconnect();

  if (!result.ok || jobs.length !== 1 || refreshed?.status !== "Analyzing") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
