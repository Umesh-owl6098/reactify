import { describe, expect, it } from "vitest";
import { estimateTokens } from "./token-estimator.js";

describe("estimateTokens", () => {
  it("returns conservative deterministic estimates", () => {
    const first = estimateTokens({
      operationType: "design_analysis",
      maxOutputTokens: 8192,
      includesImage: true,
    });
    const second = estimateTokens({
      operationType: "design_analysis",
      maxOutputTokens: 8192,
      includesImage: true,
    });
    expect(first).toEqual(second);
    expect(first.estimatedInputTokens).toBeGreaterThan(1000);
    expect(first.estimatedOutputTokens).toBe(8192);
  });

  it("estimates larger project generation prompts higher than small edits", () => {
    const generation = estimateTokens({
      operationType: "react_project_generation",
      maxOutputTokens: 4096,
    });
    const edit = estimateTokens({
      operationType: "edit_intent_analysis",
      maxOutputTokens: 4096,
      instruction: "Make the button blue",
    });
    expect(generation.estimatedInputTokens).toBeGreaterThan(edit.estimatedInputTokens);
  });
});
