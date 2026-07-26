import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { GenerationStore } from "../pipeline/store.js";
import { isGenerationRetryAllowed } from "./generation-recovery.js";

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
