import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { GenerationStore } from "../pipeline/store.js";
import { isGenerationRetryAllowed, recoverFailedGeneration, resolveRecoveryJobType } from "./generation-recovery.js";

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

describe("isGenerationRetryAllowed", () => {
  it("allows retry for recoverable JOB_NOT_FOUND design analysis failures", () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.JOB_NOT_FOUND, "missing job", {
      manualRetryAllowed: true,
    });

    expect(isGenerationRetryAllowed(store.get(record.id)!)).toBe(true);
  });

  it("allows retry for legacy DATABASE_UNAVAILABLE design-analysis failures", () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "design_analysis", ErrorCode.DATABASE_UNAVAILABLE, "legacy failure", {
      manualRetryAllowed: true,
    });

    expect(isGenerationRetryAllowed(store.get(record.id)!)).toBe(true);
  });

  it("blocks retry when design analysis already exists", () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.outputs.designAnalysis = {
      schemaVersion: "1",
      responseVersion: "test-response-v1",
      layoutHierarchy: "layout",
      componentHierarchy: [],
      colors: [],
      typography: [],
      spacing: [],
    };
    store.markFailed(record.id, "design_analysis", ErrorCode.JOB_NOT_FOUND, "missing job", {
      manualRetryAllowed: true,
    });

    expect(isGenerationRetryAllowed(store.get(record.id)!)).toBe(false);
  });
});

function minimalDesignAnalysis() {
  return {
    schemaVersion: "1" as const,
    responseVersion: "test-response-v1",
    layoutHierarchy: "layout",
    componentHierarchy: [],
    colors: [],
    typography: [],
    spacing: [],
  };
}

describe("resolveRecoveryJobType", () => {
  it("reroutes generation_plan_creation recovery to design_analysis when analysis is missing", () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });

    expect(resolveRecoveryJobType("generation_plan_creation", record)).toBe("design_analysis");
  });

  it("keeps generation_plan_creation when analysis already exists", () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.outputs.designAnalysis = minimalDesignAnalysis();

    expect(resolveRecoveryJobType("generation_plan_creation", record)).toBe("generation_plan_creation");
  });
});

describe("recoverFailedGeneration plan reroute", () => {
  it("enqueues design_analysis when retrying generation_plan_creation without analysis", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    store.markFailed(record.id, "generation_plan_creation", ErrorCode.JOB_NOT_FOUND, "missing job", {
      manualRetryAllowed: true,
    });

    const enqueue = vi.fn().mockResolvedValue({
      job: {
        jobId: "55555555-5555-4555-8555-555555555555",
        generationId: record.id,
        jobType: "design_analysis",
        status: "queued",
        createdAt: new Date().toISOString(),
        statusUrl: "/api/v1/jobs/55555555-5555-4555-8555-555555555555",
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
      } as never,
      imageStorage: {
        get: vi.fn().mockResolvedValue({ imageId: record.imageId }),
      } as never,
      ownerId: "owner",
    });

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "design_analysis",
        payload: { generationId: record.id, imageId: record.imageId },
      }),
    );
    expect(store.get(record.id)?.status).toBe("Analyzing");
  });

  it("enqueues generation_plan_creation when analysis already exists", async () => {
    const store = createStore();
    const record = store.create({ ownerId: "owner", imageId: "image" });
    record.outputs.designAnalysis = minimalDesignAnalysis();
    store.markFailed(record.id, "generation_plan_creation", ErrorCode.JOB_NOT_FOUND, "missing job", {
      manualRetryAllowed: true,
    });

    const enqueue = vi.fn().mockResolvedValue({
      job: {
        jobId: "66666666-6666-4666-8666-666666666666",
        generationId: record.id,
        jobType: "generation_plan_creation",
        status: "queued",
        createdAt: new Date().toISOString(),
        statusUrl: "/api/v1/jobs/66666666-6666-4666-8666-666666666666",
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
      } as never,
      imageStorage: {
        get: vi.fn().mockResolvedValue({ imageId: record.imageId }),
      } as never,
      ownerId: "owner",
    });

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "generation_plan_creation",
        payload: { generationId: record.id },
      }),
    );
    expect(store.get(record.id)?.status).toBe("Planning");
  });
});
