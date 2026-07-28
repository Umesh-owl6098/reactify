import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateEnv } from "../env.js";
import * as structuredLog from "../lib/structured-log.js";
import type { GenerationRecord } from "../pipeline/types.js";
import { createJobConfig } from "./job-config.js";
import type { JobHandler } from "./job-context.js";
import { JobRepository } from "./job-repository.js";
import { JobRunner } from "./job-runner.js";
import type { BackgroundJobType } from "./job-types.js";
import { testEnv } from "../test/helpers.js";
import { resetWorkerIdForTests } from "./worker-id.js";

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
    stateVersion: 1,
  };
}

function createRunnerDeps(options: {
  handler?: JobHandler;
  createHandler?: (ids: { generationId: string; jobId: string }) => JobHandler;
  enqueue?: ReturnType<typeof vi.fn>;
  ownsLock?: ReturnType<typeof vi.fn>;
  heartbeat?: ReturnType<typeof vi.fn>;
  completeJob?: ReturnType<typeof vi.fn>;
  persist?: ReturnType<typeof vi.fn>;
  repository?: JobRepository;
  config?: ReturnType<typeof createJobConfig>;
  generationId?: string;
  jobId?: string;
  jobType?: BackgroundJobType;
}) {
  const generationId = options.generationId ?? randomUUID();
  const imageId = randomUUID();
  const jobId = options.jobId ?? randomUUID();
  const record = createGenerationRecord(generationId, "owner-1");
  const enqueue = options.enqueue ?? vi.fn().mockResolvedValue({ job: { id: "plan-1", status: "queued" }, created: true });
  const persist = options.persist ?? vi.fn().mockResolvedValue(undefined);
  const heartbeat = options.heartbeat ?? vi.fn().mockResolvedValue(true);
  const ownsLock = options.ownsLock ?? vi.fn().mockResolvedValue(true);
  const completeJob = options.completeJob ?? vi.fn().mockResolvedValue(true);
  const handler =
    options.createHandler?.({ generationId, jobId }) ??
    options.handler ??
    vi.fn().mockResolvedValue({ result: { stage: "design_analysis" } });

  const jobRecord = {
    id: jobId,
    generationId,
    ownerId: "owner-1",
    jobType: options.jobType ?? "design_analysis",
    attemptNumber: 1,
    maxAttempts: 3,
    cancellationRequested: false,
    status: "running" as const,
    correlationId: "corr-1",
    payload: { generationId, imageId },
  };

  const runner = new JobRunner({
    repository: (options.repository ??
      ({
        getById: vi.fn().mockResolvedValue(jobRecord),
        startAttempt: vi.fn().mockResolvedValue(jobRecord),
        heartbeat,
        ownsLock,
        completeJob,
        failJob: vi.fn(),
        updateProgress: vi.fn(),
      } as never)) as JobRepository,
    store: {
      get: vi.fn(() => record),
      hydrate: vi.fn(),
      persist,
    } as never,
    registry: new Map<BackgroundJobType, JobHandler>([[options.jobType ?? "design_analysis", handler]]),
    config: options.config ?? {
      pollIntervalMs: 1000,
      workerConcurrency: 1,
      heartbeatIntervalMs: 200,
      lockTtlMs: 800,
      staleRecoveryIntervalMs: 60_000,
      shutdownGraceMs: 0,
      defaultMaxAttempts: 3,
      exportMaxAttempts: 2,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 1000,
      batchSize: 1,
      inlineExecution: false,
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    },
    jobService: { enqueue } as never,
    env: validateEnv({
      ...process.env,
      DATABASE_URL: databaseUrl,
      MOCK_AI_FAILURE_STAGE: undefined,
    }),
  });

  return { runner, enqueue, persist, heartbeat, ownsLock, completeJob, jobId, generationId, record };
}

describe("JobRunner chain enqueue", () => {
  let logWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetWorkerIdForTests();
    logWarnSpy = vi.spyOn(structuredLog, "logWarn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logWarnSpy.mockRestore();
  });

  it("enqueues chained jobs after persist and completeJob on the happy path", async () => {
    const { runner, enqueue, persist, completeJob, jobId, generationId } = createRunnerDeps({
      createHandler: ({ generationId, jobId }) =>
        vi.fn().mockResolvedValue({
          result: { stage: "design_analysis" },
          chainJobs: [
            {
              jobType: "generation_plan_creation",
              payload: { generationId },
              idempotencyKey: `plan-${generationId}-${jobId}`,
            },
          ],
        }),
    });

    await runner.executeJobById(jobId);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(completeJob).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      generationId,
      ownerId: "owner-1",
      jobType: "generation_plan_creation",
      payload: { generationId },
      idempotencyKey: `plan-${generationId}-${jobId}`,
      parentJobId: jobId,
    });
    expect(logWarnSpy).not.toHaveBeenCalled();
  });

  it("emits job_post_handler_lock_lost and skips persist and chain enqueue when ownership is lost", async () => {
    const ownsLock = vi.fn().mockResolvedValue(false);
    const { runner, enqueue, persist, completeJob, jobId, generationId } = createRunnerDeps({
      ownsLock,
      createHandler: ({ generationId, jobId }) =>
        vi.fn().mockResolvedValue({
          result: { stage: "design_analysis" },
          chainJobs: [
            {
              jobType: "generation_plan_creation",
              payload: { generationId },
              idempotencyKey: `plan-${generationId}-${jobId}`,
            },
          ],
        }),
    });

    await runner.executeJobById(jobId);

    expect(logWarnSpy).toHaveBeenCalledWith("job_post_handler_lock_lost", {
      jobId,
      generationId,
      jobType: "design_analysis",
      chainJobCount: 1,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("emits job_chain_enqueue_skipped_incomplete_job when completeJob returns false", async () => {
    const completeJob = vi.fn().mockResolvedValue(false);
    const { runner, enqueue, persist, jobId, generationId } = createRunnerDeps({
      completeJob,
      createHandler: ({ generationId, jobId }) =>
        vi.fn().mockResolvedValue({
          result: { stage: "design_analysis" },
          chainJobs: [
            {
              jobType: "generation_plan_creation",
              payload: { generationId },
              idempotencyKey: `plan-${generationId}-${jobId}`,
            },
          ],
        }),
    });

    await runner.executeJobById(jobId);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(logWarnSpy).toHaveBeenCalledWith("job_chain_enqueue_skipped_incomplete_job", {
      jobId,
      generationId,
      jobType: "design_analysis",
      chainJobCount: 1,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("renews the lease immediately before and after the handler", async () => {
    const handler = vi.fn().mockResolvedValue({ result: { stage: "design_analysis" } });
    const heartbeat = vi.fn().mockResolvedValue(true);
    const { runner, jobId } = createRunnerDeps({ handler, heartbeat });

    await runner.executeJobById(jobId);

    expect(heartbeat).toHaveBeenCalled();
    const heartbeatJobIds = heartbeat.mock.calls.map((call) => call[0]);
    expect(heartbeatJobIds.filter((id) => id === jobId).length).toBeGreaterThanOrEqual(2);
  });
});

describe("JobRunner chain enqueue with real lease heartbeats", () => {
  let prisma: PrismaClient;
  let repository: JobRepository;
  let generationId: string;
  let ownerId: string;
  let jobId: string;
  let record: GenerationRecord;
  let logWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    resetWorkerIdForTests();
    logWarnSpy = vi.spyOn(structuredLog, "logWarn").mockImplementation(() => undefined);

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const chainConfig = createJobConfig({
      ...testEnv,
      JOB_LOCK_TTL_MS: 800,
      JOB_HEARTBEAT_INTERVAL_MS: 200,
    });
    repository = new JobRepository(prisma, chainConfig);
    generationId = randomUUID();
    ownerId = randomUUID();
    record = createGenerationRecord(generationId, ownerId);

    await prisma.user.create({
      data: {
        id: ownerId,
        email: `chain-${ownerId}@example.com`,
        normalizedEmail: `chain-${ownerId}@example.com`,
        passwordHash: "hash",
        displayName: "Chain Test User",
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
    logWarnSpy.mockRestore();
    await prisma.jobAttempt.deleteMany({ where: { jobId } });
    await prisma.backgroundJob.deleteMany({ where: { generationId } });
    await prisma.generation.deleteMany({ where: { id: generationId } });
    await prisma.uploadedImage.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it(
    "keeps the lease alive during a long handler and chains the next job",
    async () => {
      const chainConfig = createJobConfig({
        ...testEnv,
        JOB_LOCK_TTL_MS: 800,
        JOB_HEARTBEAT_INTERVAL_MS: 200,
      });
      const enqueue = vi.fn().mockResolvedValue({
        job: { id: randomUUID(), status: "queued" },
        created: true,
      });
      const handler = vi.fn(async (_payload, context) => {
        await context.renewLease();
        await new Promise((resolve) => setTimeout(resolve, 600));
        return {
          result: { stage: "design_analysis" },
          chainJobs: [
            {
              jobType: "generation_plan_creation" as const,
              payload: { generationId },
              idempotencyKey: `plan-${generationId}-${jobId}`,
            },
          ],
        };
      });

      const runner = new JobRunner({
        repository,
        store: {
          get: vi.fn(() => record),
          hydrate: vi.fn(),
          persist: vi.fn().mockResolvedValue(undefined),
        } as never,
        registry: new Map<BackgroundJobType, JobHandler>([["design_analysis", handler]]),
        config: chainConfig,
        jobService: { enqueue } as never,
        env: validateEnv({
          ...process.env,
          DATABASE_URL: databaseUrl,
          MOCK_AI_FAILURE_STAGE: undefined,
        }),
      });

      await runner.executeJobById(jobId);

      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(logWarnSpy).not.toHaveBeenCalledWith(
        "job_post_handler_lock_lost",
        expect.objectContaining({ jobId }),
      );
      expect(logWarnSpy).not.toHaveBeenCalledWith(
        "job_chain_enqueue_skipped_incomplete_job",
        expect.objectContaining({ jobId }),
      );

      const completed = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
      expect(completed?.status).toBe("completed");
    },
    10_000,
  );
});
