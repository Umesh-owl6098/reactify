import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import type { DesignAnalysisV1 } from "@reactify/generation-contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { GenerationStore } from "./store.js";
import type { PipelineState } from "./types.js";

/**
 * The design analysis exists both on the record (durable, read by the API) and
 * inside the pipeline checkpoint (a point-in-time copy). These cover the ways
 * the checkpoint used to silently roll the durable copy back.
 */
describe("generation output durability", () => {
  let store: GenerationStore;

  beforeEach(() => {
    store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  });

  function analysis(overrides: Partial<DesignAnalysisV1> = {}): DesignAnalysisV1 {
    return {
      schemaVersion: "1",
      summary: "A device illustration.",
      colors: [],
      typography: [],
      spacing: [],
      componentTree: [],
      layoutHierarchy: [],
      icons: [],
      ...overrides,
    } as unknown as DesignAnalysisV1;
  }

  it("keeps outputs a stage did not produce", () => {
    const record = store.create({ imageId: "image-1" });
    record.outputs.designAnalysis = analysis({ summary: "current analysis" } as Partial<DesignAnalysisV1>);

    store.applyStateOutputs(record, { imageId: "image-1" } as PipelineState);

    expect(record.outputs.designAnalysis?.summary).toBe("current analysis");
  });

  it("takes the output a stage did produce", () => {
    const record = store.create({ imageId: "image-1" });
    record.outputs.designAnalysis = analysis({ summary: "old analysis" } as Partial<DesignAnalysisV1>);

    store.applyStateOutputs(record, {
      imageId: "image-1",
      designAnalysis: analysis({ summary: "fresh analysis" } as Partial<DesignAnalysisV1>),
    } as PipelineState);

    expect(record.outputs.designAnalysis?.summary).toBe("fresh analysis");
  });

  it("does not drop a field the stored analysis gained after the checkpoint was written", () => {
    const record = store.create({ imageId: "image-1" });
    const enriched = analysis({
      summary: "re-analysed",
      visualComposition: {
        schemaVersion: "1",
        sourceWidth: 2000,
        sourceHeight: 1111,
        backgroundColor: "#1e63d0",
        objects: [],
      },
    } as unknown as Partial<DesignAnalysisV1>);
    record.outputs.designAnalysis = enriched;

    store.applyStateOutputs(record, { imageId: "image-1" } as PipelineState);

    expect(record.outputs.designAnalysis?.visualComposition).toBeDefined();
  });
});
