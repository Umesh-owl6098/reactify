import { describe, expect, it } from "vitest";
import { testEnv } from "../test/helpers.js";
import { resolveOperationAIConfig } from "./ai-provider-config.js";

describe("resolveOperationAIConfig", () => {
  it("maps OpenAI operations to their stage model and output budget", () => {
    const env = {
      ...testEnv,
      AI_PROVIDER: "openai" as const,
      OPENAI_DESIGN_ANALYSIS_MODEL: "design-model",
      OPENAI_PLAN_MODEL: "plan-model",
      OPENAI_CODE_GENERATION_MODEL: "code-model",
      OPENAI_EDIT_MODEL: "edit-model",
      OPENAI_DESIGN_ANALYSIS_MAX_OUTPUT_TOKENS: 4000,
      OPENAI_PLAN_MAX_OUTPUT_TOKENS: 5000,
      OPENAI_CODE_GENERATION_MAX_OUTPUT_TOKENS: 30000,
      OPENAI_EDIT_MAX_OUTPUT_TOKENS: 12000,
    };

    expect(resolveOperationAIConfig(env, "design_analysis")).toMatchObject({
      model: "design-model",
      maxTokens: 4000,
    });
    expect(resolveOperationAIConfig(env, "generation_plan_creation")).toMatchObject({
      model: "plan-model",
      maxTokens: 5000,
    });
    expect(resolveOperationAIConfig(env, "react_project_generation")).toMatchObject({
      model: "code-model",
      maxTokens: 30000,
    });
    for (const operation of [
      "automatic_repair",
      "edit_intent_analysis",
      "project_edit_generation",
      "visual_correction",
    ] as const) {
      expect(resolveOperationAIConfig(env, operation)).toMatchObject({
        model: "edit-model",
        maxTokens: 12000,
      });
    }
  });

  it("preserves the shared Anthropic and mock configuration", () => {
    expect(resolveOperationAIConfig(testEnv, "react_project_generation")).toMatchObject({
      model: testEnv.ANTHROPIC_MODEL,
      maxTokens: testEnv.AI_MAX_TOKENS,
    });
  });

  it("never falls back to a legacy generic OpenAI model", () => {
    expect(() =>
      resolveOperationAIConfig(
        { ...testEnv, AI_PROVIDER: "openai", OPENAI_DESIGN_ANALYSIS_MODEL: undefined },
        "design_analysis",
      ),
    ).toThrow("OPENAI_DESIGN_ANALYSIS_MODEL is required");
  });
});
