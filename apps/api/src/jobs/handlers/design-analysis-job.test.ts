import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { GenerationStore } from "../../pipeline/store.js";
import type { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import type { JobExecutionContext } from "../job-context.js";
import { createDesignAnalysisHandler } from "./design-analysis-job.js";

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

function createContext(
  store: GenerationStore,
  generationId: string,
  jobId: string,
): JobExecutionContext {
  return {
    jobId,
    generationId,
    ownerId: "22222222-2222-4222-8222-222222222222",
    workerId: "worker-test",
    attemptNumber: 1,
    progress: {
      report: vi.fn().mockResolvedValue(undefined),
    },
    store,
    repository: {} as JobExecutionContext["repository"],
    isCancelled: async () => false,
    ownsLock: async () => true,
    renewLease: vi.fn().mockResolvedValue(true),
    assertCanMutate: async () => undefined,
  };
}

describe("createDesignAnalysisHandler", () => {
  it("scopes chained plan idempotency keys to the completing design-analysis job", async () => {
    const store = createStore();
    const generationId = store.create({ ownerId: "owner", imageId: "image-1" }).id;
    const runSegment = vi.fn().mockResolvedValue({ outcome: "completed" });
    const handler = createDesignAnalysisHandler({ runSegment } as unknown as PipelineRunner);

    const firstAnalysisJobId = "11111111-1111-4111-8111-111111111111";
    const secondAnalysisJobId = "22222222-2222-4222-8222-222222222222";

    const first = await handler(
      { generationId, imageId: "image-1" },
      createContext(store, generationId, firstAnalysisJobId),
    );
    const second = await handler(
      { generationId, imageId: "image-1" },
      createContext(store, generationId, secondAnalysisJobId),
    );

    expect(first.chainJobs?.[0]?.idempotencyKey).toBe(`plan-${generationId}-${firstAnalysisJobId}`);
    expect(second.chainJobs?.[0]?.idempotencyKey).toBe(`plan-${generationId}-${secondAnalysisJobId}`);
    expect(first.chainJobs?.[0]?.idempotencyKey).not.toBe(second.chainJobs?.[0]?.idempotencyKey);
  });

  it("returns the same plan key when the same design-analysis job reruns", async () => {
    const store = createStore();
    const generationId = store.create({ ownerId: "owner", imageId: "image-1" }).id;
    const analysisJobId = "33333333-3333-4333-8333-333333333333";
    const runSegment = vi.fn().mockResolvedValue({ outcome: "completed" });
    const handler = createDesignAnalysisHandler({ runSegment } as unknown as PipelineRunner);
    const context = createContext(store, generationId, analysisJobId);

    const first = await handler({ generationId, imageId: "image-1" }, context);
    const second = await handler({ generationId, imageId: "image-1" }, context);

    expect(first.chainJobs?.[0]?.idempotencyKey).toBe(`plan-${generationId}-${analysisJobId}`);
    expect(second.chainJobs?.[0]?.idempotencyKey).toBe(first.chainJobs?.[0]?.idempotencyKey);
  });

  it("renews the worker lease before the long-running analysis segment", async () => {
    const store = createStore();
    const generationId = store.create({ ownerId: "owner", imageId: "image-1" }).id;
    const renewLease = vi.fn().mockResolvedValue(true);
    const runSegment = vi.fn().mockResolvedValue({ outcome: "completed" });
    const handler = createDesignAnalysisHandler({ runSegment } as unknown as PipelineRunner);
    const context = createContext(store, generationId, "55555555-5555-4555-8555-555555555555");
    context.renewLease = renewLease;

    await handler({ generationId, imageId: "image-1" }, context);

    expect(renewLease).toHaveBeenCalledTimes(1);
    expect(runSegment).toHaveBeenCalled();
  });

  it("throws when the generation record is missing", async () => {
    const store = createStore();
    const runSegment = vi.fn();
    const handler = createDesignAnalysisHandler({ runSegment } as unknown as PipelineRunner);

    await expect(
      handler(
        { generationId: "00000000-0000-4000-8000-000000000000", imageId: "image-1" },
        createContext(store, "00000000-0000-4000-8000-000000000000", "44444444-4444-4444-8444-444444444444"),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.GENERATION_NOT_FOUND });
  });
});
