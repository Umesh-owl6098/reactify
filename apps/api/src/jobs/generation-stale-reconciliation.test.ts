import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { GenerationStore } from "../pipeline/store.js";
import { reconcileStaleGenerationState } from "./generation-stale-reconciliation.js";
import type { JobRepository } from "./job-repository.js";

function createStore() {
  return new GenerationStore(
    {
      enableRepair: true,
      enableInspector: true,
      enableAccessibility: true,
      enableGenerationPlanEditing: true,
    },
    3,
  );
}

function mockRepository(overrides: Partial<JobRepository>): JobRepository {
  return {
    findRelevantJobForReconciliation: vi.fn(),
    ...overrides,
  } as unknown as JobRepository;
}

describe("reconcileStaleGenerationState", () => {
  it("does not fail a newly created analyzing generation within the grace period", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Analyzing";
    record.updatedAt = new Date().toISOString();

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue(null),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    expect(store.get(record.id)?.status).toBe("Analyzing");
  });

  it("marks analyzing generations failed when no design analysis job exists after grace", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Analyzing";
    record.updatedAt = new Date(Date.now() - 300_000).toISOString();

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue(null),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    const updated = store.get(record.id);
    expect(updated?.status).toBe("Failed");
    expect(updated?.errors.at(-1)?.code).toBe(ErrorCode.JOB_NOT_FOUND);
    expect(updated?.manualRetryAllowed).toBe(true);
  });

  it("finds queued jobs without failing", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Analyzing";
    record.updatedAt = new Date().toISOString();

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue({
        id: "job-id",
        status: "queued",
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      }),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    expect(store.get(record.id)?.status).toBe("Analyzing");
  });

  it("finds running jobs without failing", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Analyzing";

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue({
        id: "job-id",
        status: "running",
        updatedAt: new Date(),
      }),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    expect(store.get(record.id)?.status).toBe("Analyzing");
  });

  it("finds retry-scheduled replacement jobs without failing", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Analyzing";

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue({
        id: "replacement-job",
        status: "retry_scheduled",
        updatedAt: new Date(),
      }),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    expect(store.get(record.id)?.status).toBe("Analyzing");
  });

  it("does not fail waiting-for-client jobs", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Planning";

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue({
        id: "job-id",
        status: "waiting_for_client",
        updatedAt: new Date(),
      }),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    expect(store.get(record.id)?.status).toBe("Planning");
  });

  it("marks analyzing generations stalled when queued too long without a worker", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Analyzing";
    record.updatedAt = new Date(Date.now() - 300_000).toISOString();

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue({
        id: "job-id",
        status: "queued",
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(Date.now() - 300_000),
      }),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    const updated = store.get(record.id);
    expect(updated?.status).toBe("Failed");
    expect(updated?.errors.at(-1)?.code).toBe(ErrorCode.JOB_STALLED);
  });

  it("syncs terminal job failures back to the generation after grace", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.status = "Analyzing";
    record.updatedAt = new Date(Date.now() - 300_000).toISOString();

    const repository = mockRepository({
      findRelevantJobForReconciliation: vi.fn().mockResolvedValue({
        id: "job-id",
        status: "failed",
        failureCode: ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        failureMessage: "Anthropic is not configured for the worker.",
        updatedAt: new Date(Date.now() - 300_000),
      }),
    });

    await reconcileStaleGenerationState(record.id, store, repository, {
      staleGenerationThresholdMs: 120_000,
      jobMissingGraceMs: 60_000,
    });

    const updated = store.get(record.id);
    expect(updated?.status).toBe("Failed");
    expect(updated?.errors.at(-1)?.code).toBe(ErrorCode.AI_PROVIDER_NOT_CONFIGURED);
  });
});
