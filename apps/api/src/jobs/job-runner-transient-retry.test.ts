import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErrorCode } from "@reactify/shared";
import { validateEnv } from "../env.js";
import { createJobConfig } from "./job-config.js";
import { JobRepository } from "./job-repository.js";
import { JobRunner } from "./job-runner.js";
import { TransientJobError, PermanentJobError } from "./job-errors.js";
import type { BackgroundJobType } from "./job-types.js";
import type { GenerationRecord } from "../pipeline/types.js";
import { testEnv } from "../test/helpers.js";
import { resetWorkerIdForTests, getWorkerId } from "./worker-id.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? testEnv.DATABASE_URL;

function createGenerationRecord(generationId: string, ownerId: string): GenerationRecord {
  return {
    id: generationId,
    ownerId,
    imageId: randomUUID(),
    projectId: randomUUID(),
    status: "Analyzing",
    activeStage: "design_analysis",
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
    failStage: undefined,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("JobRunner transient OpenAI retries", () => {
  let prisma: PrismaClient;
  let repository: JobRepository;
  let generationId: string;
  let ownerId: string;
  let jobId: string;
  let record: GenerationRecord;

  beforeEach(async () => {
    resetWorkerIdForTests();
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    repository = new JobRepository(prisma, createJobConfig(testEnv));
    generationId = randomUUID();
    ownerId = randomUUID();
    record = createGenerationRecord(generationId, ownerId);

    await prisma.user.create({
      data: {
        id: ownerId,
        email: `retry-${ownerId}@example.com`,
        normalizedEmail: `retry-${ownerId}@example.com`,
        passwordHash: "hash",
        displayName: "Retry Test User",
      },
    });

    const imageId = randomUUID();
    await prisma.uploadedImage.create({
      data: {
        id: imageId,
        ownerId,
        storageKey: `test/${imageId}.png`,
        mimeType: "image/png",
        sizeBytes: 100,
      },
    });

    await prisma.generation.create({
      data: {
        id: generationId,
        ownerId,
        projectId: record.projectId,
        sourceImageId: imageId,
        status: "Analyzing",
      },
    });

    const enqueued = await repository.enqueue({
      generationId,
      ownerId,
      jobType: "design_analysis",
      payload: { generationId, imageId },
      idempotencyKey: `design-${generationId}`,
    });
    jobId = enqueued.job.id;
  });

  afterEach(async () => {
    await prisma.jobAttempt.deleteMany({ where: { jobId } });
    await prisma.backgroundJob.deleteMany({ where: { generationId } });
    await prisma.generation.deleteMany({ where: { id: generationId } });
    await prisma.uploadedImage.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("schedules retry on HTTP 500 and keeps generation out of Failed until max attempts", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(
        new TransientJobError(ErrorCode.AI_PROVIDER_UNAVAILABLE, "OpenAI server error.", {
          httpStatus: 500,
          providerErrorType: "server_error",
          providerRequestId: "req-500",
          providerMessage: "server error",
        }),
      )
      .mockResolvedValueOnce({ result: { stage: "design_analysis" } });

    const store = {
      get: vi.fn(() => record),
      hydrate: vi.fn(),
      persist: vi.fn(),
    };

    const runner = new JobRunner({
      repository,
      store: store as never,
      registry: new Map<BackgroundJobType, typeof handler>([["design_analysis", handler]]),
      config: createJobConfig(testEnv),
      jobService: {} as never,
      env: validateEnv({
        ...process.env,
        DATABASE_URL: databaseUrl,
        MOCK_AI_FAILURE_STAGE: undefined,
      }),
    });

    await runner.executeJobById(jobId);

    const afterFirstFailure = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    const attemptsAfterFirst = await prisma.jobAttempt.findMany({ where: { jobId }, orderBy: { attemptNumber: "asc" } });
    expect(afterFirstFailure?.status).toBe("retry_scheduled");
    expect(afterFirstFailure?.attemptNumber).toBe(1);
    expect(record.status).toBe("Analyzing");
    expect(attemptsAfterFirst[0]?.failureMetadata).toMatchObject({
      httpStatus: 500,
      providerErrorType: "server_error",
      providerRequestId: "req-500",
    });

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { availableAt: new Date(0) },
    });

    await runner.executeJobById(jobId);

    const afterSuccess = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(afterSuccess?.status).toBe("completed");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("marks the job and generation failed only after exhausting max attempts", async () => {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { maxAttempts: 2 },
    });

    const handler = vi.fn().mockRejectedValue(
      new TransientJobError(ErrorCode.AI_PROVIDER_UNAVAILABLE, "OpenAI server error.", {
        httpStatus: 500,
        providerErrorType: "server_error",
      }),
    );

    const store = {
      get: vi.fn(() => record),
      hydrate: vi.fn(),
      persist: vi.fn(),
    };

    const runner = new JobRunner({
      repository,
      store: store as never,
      registry: new Map<BackgroundJobType, typeof handler>([["design_analysis", handler]]),
      config: createJobConfig({ ...testEnv, JOB_DEFAULT_MAX_ATTEMPTS: 2 }),
      jobService: {} as never,
      env: validateEnv({
        ...process.env,
        DATABASE_URL: databaseUrl,
        JOB_DEFAULT_MAX_ATTEMPTS: "2",
        MOCK_AI_FAILURE_STAGE: undefined,
      }),
    });

    const workerId = getWorkerId();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        await prisma.backgroundJob.update({
          where: { id: jobId },
          data: { availableAt: new Date(0) },
        });
      }

      const claimed = await repository.claimNextJob(workerId);
      expect(claimed?.id).toBe(jobId);
      await runner.executeJobById(jobId);
    }

    const finalJob = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(finalJob?.status).toBe("dead_letter");
    expect(finalJob?.attemptNumber).toBe(2);
    expect(record.status).toBe("Failed");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent authentication failures", async () => {
    const handler = vi.fn().mockRejectedValue(
      new PermanentJobError(ErrorCode.AI_AUTHENTICATION_FAILED, "OpenAI authentication failed."),
    );

    const store = {
      get: vi.fn(() => record),
      hydrate: vi.fn(),
      persist: vi.fn(),
    };

    const runner = new JobRunner({
      repository,
      store: store as never,
      registry: new Map<BackgroundJobType, typeof handler>([["design_analysis", handler]]),
      config: createJobConfig(testEnv),
      jobService: {} as never,
      env: validateEnv({
        ...process.env,
        DATABASE_URL: databaseUrl,
        MOCK_AI_FAILURE_STAGE: undefined,
      }),
    });

    const workerId = getWorkerId();
    const claimed = await repository.claimNextJob(workerId);
    expect(claimed?.id).toBe(jobId);
    await runner.executeJobById(jobId);

    const finalJob = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(finalJob?.status).toBe("failed");
    expect(finalJob?.attemptNumber).toBe(1);
    expect(record.status).toBe("Failed");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
