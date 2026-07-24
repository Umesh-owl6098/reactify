import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { GenerationStore } from "../pipeline/store.js";
import { recoverFailedGeneration } from "../jobs/generation-recovery.js";
import type { JobService } from "../jobs/job-service.js";

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

describe("recoverFailedGeneration", () => {
  it("creates exactly one replacement design-analysis job", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.JOB_NOT_FOUND, "missing job", {
      manualRetryAllowed: true,
    });

    const enqueue = vi.fn().mockResolvedValue({
      job: {
        jobId: "11111111-1111-4111-8111-111111111111",
        generationId: record.id,
        jobType: "design_analysis",
        status: "queued",
        createdAt: new Date().toISOString(),
        statusUrl: "/api/v1/jobs/11111111-1111-4111-8111-111111111111",
      },
      created: true,
    });

    const jobService = {
      repository: {
        findActiveJobByType: vi.fn().mockResolvedValue(null),
      },
      enqueue,
    } as unknown as JobService;

    const result = await recoverFailedGeneration({
      record: store.get(record.id)!,
      store,
      jobService,
      imageStorage: {
        get: vi.fn().mockResolvedValue({ imageId: record.imageId }),
      } as never,
      ownerId: "owner",
    });

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(store.get(record.id)?.status).toBe("Analyzing");
    expect(store.get(record.id)?.errors.some((entry) => entry.code === ErrorCode.JOB_NOT_FOUND)).toBe(true);
  });

  it("does not create duplicate jobs when an active job already exists", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.JOB_NOT_FOUND, "missing job", {
      manualRetryAllowed: true,
    });

    const enqueue = vi.fn();
    const jobService = {
      repository: {
        findActiveJobByType: vi.fn().mockResolvedValue({ id: "existing-job" }),
      },
      enqueue,
    } as unknown as JobService;

    const result = await recoverFailedGeneration({
      record: store.get(record.id)!,
      store,
      jobService,
      imageStorage: {
        get: vi.fn().mockResolvedValue({ imageId: record.imageId }),
      } as never,
      ownerId: "owner",
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("blocks retry when the source image is missing", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.JOB_NOT_FOUND, "missing job", {
      manualRetryAllowed: true,
    });

    const result = await recoverFailedGeneration({
      record: store.get(record.id)!,
      store,
      jobService: {
        repository: {
          findActiveJobByType: vi.fn().mockResolvedValue(null),
        },
        enqueue: vi.fn(),
      } as unknown as JobService,
      imageStorage: {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      ownerId: "owner",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(ErrorCode.IMAGE_NOT_FOUND);
    }
  });
});
