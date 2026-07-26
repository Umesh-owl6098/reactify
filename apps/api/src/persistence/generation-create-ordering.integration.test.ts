import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErrorCode } from "@reactify/shared";
import { createJobConfig } from "../jobs/job-config.js";
import { JobRepository } from "../jobs/job-repository.js";
import { GenerationRepository } from "./repositories/GenerationRepository.js";
import { testEnv } from "../test/helpers.js";
import type { GenerationRecord } from "../pipeline/types.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? testEnv.DATABASE_URL;

describe("generation create ordering integration", () => {
  let prisma: PrismaClient;
  let repository: JobRepository;
  let generations: GenerationRepository;
  let ownerId: string;
  let imageId: string;
  let generationId: string;

  beforeEach(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    repository = new JobRepository(prisma, createJobConfig(testEnv));
    generations = new GenerationRepository(prisma);
    generationId = randomUUID();
    ownerId = randomUUID();
    imageId = randomUUID();

    await prisma.user.create({
      data: {
        id: ownerId,
        email: `ordering-${ownerId}@example.com`,
        normalizedEmail: `ordering-${ownerId}@example.com`,
        passwordHash: "hash",
        displayName: "Ordering Test User",
      },
    });

    await prisma.uploadedImage.create({
      data: {
        id: imageId,
        ownerId,
        storageKey: `test/${imageId}.png`,
        mimeType: "image/png",
        sizeBytes: 100,
      },
    });
  });

  afterEach(async () => {
    await prisma.backgroundJob.deleteMany({ where: { generationId } });
    await prisma.generation.deleteMany({ where: { id: generationId } });
    await prisma.uploadedImage.deleteMany({ where: { id: imageId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("requires the Generation row before BackgroundJob insertion succeeds", async () => {
    await expect(
      repository.enqueue({
        generationId,
        ownerId,
        jobType: "design_analysis",
        payload: { generationId, imageId },
        idempotencyKey: `design-analysis-${generationId}`,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JOB_ENQUEUE_FAILED, prismaCode: "P2003" });

    const now = new Date().toISOString();
    const record: GenerationRecord = {
      id: generationId,
      ownerId,
      imageId,
      projectId: randomUUID(),
      status: "Queued",
      activeStage: null,
      stages: [],
      outputs: { designAnalysis: null, generationPlan: null, generatedProject: null },
      analysis: null,
      plan: null,
      project: null,
      schemaValidation: null,
      staticValidation: null,
      sandboxValidation: null,
      projectHash: null,
      validationReportFingerprint: null,
      repairRequired: false,
      repairStatus: "not_required",
      currentRepairAttempt: 0,
      maxRepairAttempts: 3,
      repairAttempts: [],
      repairInProgress: false,
      manualRetryAllowed: false,
      editedByUser: false,
      confirmedAt: null,
      awaitingPlanConfirmation: false,
      awaitingSandboxValidation: false,
      pipelineState: null,
      resumeInProgress: false,
      sandboxResumeInProgress: false,
      errors: [],
      cancelled: false,
      exports: [],
      exportInProgress: false,
      versions: [],
      activeVersionId: null,
      edits: [],
      editInProgress: false,
      activeEditId: null,
      rollbackInProgress: false,
      visualComparisons: [],
      visualComparisonInProgress: false,
      activeComparisonId: null,
      visualCorrectionInProgress: false,
      visualCorrectionAttempt: 0,
      visualCorrectionMaxAttempts: 3,
      previewCaptureRequired: false,
      pendingVisualRecomparison: null,
      stateVersion: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await generations.save(record);

    const accepted = await repository.enqueue({
      generationId,
      ownerId,
      jobType: "design_analysis",
      payload: { generationId, imageId },
      idempotencyKey: `design-analysis-${generationId}`,
    });

    expect(accepted.created).toBe(true);
    const jobs = await prisma.backgroundJob.findMany({ where: { generationId } });
    expect(jobs).toHaveLength(1);
  });
});
