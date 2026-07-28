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
      id: "1a8e35c1-9c1d-4f57-8a3e-0d3b6f6f1a01",
      ownerId: "4dbf68f4-6f4a-4c8a-9d6b-3a6e9c9d4d04",
      imageId: "2b9f46d2-8d2e-4a68-9b4f-1e4c7a7b2b02",
      projectId: "5ec079a5-5a5b-4d9b-8e7c-4b7f0d0e5e05",
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
      id: "3caf57e3-7e3f-4b79-8c5a-2f5d8b8c3c03",
      generationId: "1a8e35c1-9c1d-4f57-8a3e-0d3b6f6f1a01",
      ownerId: "4dbf68f4-6f4a-4c8a-9d6b-3a6e9c9d4d04",
      jobType: "design_analysis",
      attemptNumber: 1,
      maxAttempts: 3,
      cancellationRequested: false,
      status: "running",
      correlationId: "corr-1",
      payload: { generationId: "1a8e35c1-9c1d-4f57-8a3e-0d3b6f6f1a01", imageId: "2b9f46d2-8d2e-4a68-9b4f-1e4c7a7b2b02" },
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

    await runner.executeJobById("3caf57e3-7e3f-4b79-8c5a-2f5d8b8c3c03", { skipClaim: true });

    expect(loadGenerationById).toHaveBeenCalledWith("1a8e35c1-9c1d-4f57-8a3e-0d3b6f6f1a01");
    expect(store.hydrate).toHaveBeenCalled();
    expect(inMemoryRecord.failStage).toBeUndefined();
    expect(resolveMockFailureStage(env.MOCK_AI_FAILURE_STAGE)).toBeUndefined();
  });
});
