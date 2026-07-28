import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { GenerationStore } from "../../pipeline/store.js";
import type { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import type { JobExecutionContext } from "../job-context.js";
import { createGenerationPlanHandler } from "./generation-plan-job.js";

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

function createContext(store: GenerationStore, generationId: string): JobExecutionContext {
  return {
    jobId: "11111111-1111-4111-8111-111111111111",
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
    assertCanMutate: async () => undefined,
  };
}

describe("createGenerationPlanHandler", () => {
  it("chains design_analysis when design analysis is missing", async () => {
    const store = createStore();
    const generationId = store.create({ ownerId: "owner", imageId: "image-1" }).id;
    const runSegment = vi.fn();
    const handler = createGenerationPlanHandler({ runSegment } as unknown as PipelineRunner);

    const result = await handler({ generationId }, createContext(store, generationId));

    expect(runSegment).not.toHaveBeenCalled();
    expect(result.chainJobs).toEqual([
      {
        jobType: "design_analysis",
        payload: { generationId, imageId: "image-1" },
        idempotencyKey: `design-analysis-${generationId}`,
      },
    ]);
  });

  it("runs generation_plan_creation when design analysis exists", async () => {
    const store = createStore();
    const generationId = store.create({ ownerId: "owner", imageId: "image-1" }).id;
    const record = store.get(generationId)!;
    record.outputs.designAnalysis = {
      schemaVersion: "1",
      responseVersion: "test-response-v1",
      layoutHierarchy: "layout",
      componentHierarchy: [],
      colors: [],
      typography: [],
      spacing: [],
    };

    const runSegment = vi.fn().mockResolvedValue({ outcome: "paused_plan_review" });
    const handler = createGenerationPlanHandler({ runSegment } as unknown as PipelineRunner);
    const context = createContext(store, generationId);

    const result = await handler({ generationId }, context);

    expect(runSegment).toHaveBeenCalledWith(generationId, "generation_plan_creation", expect.any(Object));
    expect(result.waitingForClient).toBe(true);
    expect(result.chainJobs).toBeUndefined();
  });

  it("throws when the generation record is missing", async () => {
    const store = createStore();
    const runSegment = vi.fn();
    const handler = createGenerationPlanHandler({ runSegment } as unknown as PipelineRunner);

    await expect(
      handler(
        { generationId: "00000000-0000-4000-8000-000000000000" },
        createContext(store, "00000000-0000-4000-8000-000000000000"),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.GENERATION_NOT_FOUND });
  });
});
