import { describe, expect, it, vi } from "vitest";
import { validateEnv } from "../env.js";
import { resolveMockFailureStage } from "../pipeline/mock-failure-stage.js";
import type { GenerationRecord } from "../pipeline/types.js";
import { JobRunner } from "./job-runner.js";
import type { BackgroundJobType } from "./job-types.js";

describe("JobRunner generation refresh", () => {
  it("reloads generation state from persistence before executing a job", async () => {
    const env = validateEnv({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://reactify:reactify_dev@localhost:5434/reactify",
      MOCK_AI_FAILURE_STAGE: undefined,
    });

    const inMemoryRecord: GenerationRecord = {
      id: "gen-1",
      ownerId: "owner",
      imageId: "image-1",
      projectId: "project-1",
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
      failStage: "design_analysis",
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

    const store = {
      get: vi.fn(() => inMemoryRecord),
      hydrate: vi.fn((records: GenerationRecord[]) => {
        Object.assign(inMemoryRecord, records[0]);
      }),
      persist: vi.fn(),
    };

    const loadGenerationById = vi.fn(async () => ({
      ...inMemoryRecord,
      failStage: undefined,
      status: "Analyzing" as const,
    }));

    const jobRecord = {
      id: "job-1",
      generationId: "gen-1",
      ownerId: "owner",
      jobType: "design_analysis",
      attemptNumber: 1,
      maxAttempts: 3,
      cancellationRequested: false,
      status: "running",
      correlationId: "corr-1",
      payload: { generationId: "gen-1", imageId: "image-1" },
    };

    const handler = vi.fn(async () => ({ result: { stage: "design_analysis" } }));
    const runner = new JobRunner({
      repository: {
        getById: vi.fn().mockResolvedValue(jobRecord),
        startAttempt: vi.fn().mockImplementation(async (jobId) => ({
          ...jobRecord,
          id: jobId,
        })),
        heartbeat: vi.fn(),
        completeJob: vi.fn().mockResolvedValue(true),
        ownsLock: vi.fn().mockResolvedValue(true),
        failJob: vi.fn(),
        updateProgress: vi.fn(),
      } as never,
      store: store as never,
      registry: new Map<BackgroundJobType, typeof handler>([["design_analysis", handler]]),
      config: {
        pollIntervalMs: 1000,
        workerConcurrency: 1,
        heartbeatIntervalMs: 1000,
        staleRecoveryIntervalMs: 60000,
        shutdownGraceMs: 0,
        defaultMaxAttempts: 3,
        exportMaxAttempts: 2,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 1000,
        batchSize: 1,
        inlineExecution: false,
        staleGenerationThresholdMs: 120000,
        missingGraceMs: 60000,
      },
      jobService: {} as never,
      env,
      loadGenerationById,
    });

    await runner.executeJobById("job-1", { skipClaim: true });

    expect(loadGenerationById).toHaveBeenCalledWith("gen-1");
    expect(store.hydrate).toHaveBeenCalled();
    expect(inMemoryRecord.failStage).toBeUndefined();
    expect(resolveMockFailureStage(env.MOCK_AI_FAILURE_STAGE)).toBeUndefined();
  });
});
