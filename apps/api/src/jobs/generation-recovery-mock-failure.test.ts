import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { GenerationStore } from "../pipeline/store.js";
import { isGenerationRetryAllowed, recoverFailedGeneration } from "./generation-recovery.js";
import type { JobService } from "./job-service.js";

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

describe("generation recovery after mock failure injection", () => {
  it("allows retry for MOCK_FAILURE_INJECTED errors", () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.MOCK_FAILURE_INJECTED, "Forced failure at design_analysis", {
      manualRetryAllowed: true,
    });

    expect(isGenerationRetryAllowed(store.get(record.id)!)).toBe(true);
  });

  it("allows retry for legacy forced-failure INTERNAL_ERROR errors", () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.INTERNAL_ERROR, "Forced failure at design_analysis", {
      manualRetryAllowed: true,
    });

    expect(isGenerationRetryAllowed(store.get(record.id)!)).toBe(true);
  });

  it("creates one replacement job and preserves failure history", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.MOCK_FAILURE_INJECTED, "Forced failure at design_analysis", {
      manualRetryAllowed: true,
    });

    const enqueue = vi.fn().mockResolvedValue({
      job: {
        jobId: "33333333-3333-4333-8333-333333333333",
        generationId: record.id,
        jobType: "design_analysis",
        status: "queued",
        createdAt: new Date().toISOString(),
        statusUrl: "/api/v1/jobs/33333333-3333-4333-8333-333333333333",
      },
      created: true,
    });

    const result = await recoverFailedGeneration({
      record: store.get(record.id)!,
      store,
      jobService: {
        repository: {
          findActiveJobByType: vi.fn().mockResolvedValue(null),
        },
        enqueue,
      } as unknown as JobService,
      imageStorage: {
        get: vi.fn().mockResolvedValue({ imageId: record.imageId }),
      } as never,
      ownerId: "owner",
    });

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `recovery-design_analysis-${record.id}-1`,
      }),
    );
    const updated = store.get(record.id)!;
    expect(updated.status).toBe("Analyzing");
    expect(updated.failStage).toBeUndefined();
    expect(updated.errors).toHaveLength(1);
    expect(updated.errors[0]?.code).toBe(ErrorCode.MOCK_FAILURE_INJECTED);
    expect(updated.outputs.designAnalysis).toBeNull();
  });

  it("reconciles stuck Analyzing state and creates a new recovery job", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.INTERNAL_ERROR, "Forced failure at design_analysis", {
      manualRetryAllowed: true,
    });
    store.recoverFromWorkerFailure(record.id, "design_analysis");
    expect(store.get(record.id)?.status).toBe("Analyzing");
    expect(store.get(record.id)?.manualRetryAllowed).toBe(false);

    const enqueue = vi.fn().mockResolvedValue({
      job: {
        jobId: "44444444-4444-4444-8444-444444444444",
        generationId: record.id,
        jobType: "design_analysis",
        status: "queued",
        createdAt: new Date().toISOString(),
        statusUrl: "/api/v1/jobs/44444444-4444-4444-8444-444444444444",
      },
      created: true,
    });

    const result = await recoverFailedGeneration({
      record: store.get(record.id)!,
      store,
      jobService: {
        repository: {
          findActiveJobByType: vi.fn().mockResolvedValue(null),
        },
        enqueue,
      } as unknown as JobService,
      imageStorage: {
        get: vi.fn().mockResolvedValue({ imageId: record.imageId }),
      } as never,
      ownerId: "owner",
    });

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `recovery-design_analysis-${record.id}-1`,
      }),
    );
    expect(store.get(record.id)?.status).toBe("Analyzing");
  });
});
