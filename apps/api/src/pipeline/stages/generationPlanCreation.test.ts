import { describe, expect, it, vi } from "vitest";
import {
  MockAIProvider,
  createGenerationPlanFixtureJson,
  designAnalysisFixture,
  generationPlanFixture,
} from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
import { generationPlanCreationStage } from "./generationPlanCreation.js";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import type { PipelineContext } from "@reactify/shared";
import { testEnv } from "../../test/helpers.js";

function createContext(provider: MockAIProvider): PipelineContext {
  return {
    generationId: "550e8400-e29b-41d4-a716-446655440000",
    projectId: "660e8400-e29b-41d4-a716-446655440000",
    imageId: "770e8400-e29b-41d4-a716-446655440000",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    flags: DEFAULT_FEATURE_FLAGS,
    aiProvider: provider,
    loadPrompt: () => ({
      meta: { promptVersion: "1.0.0", schemaVersion: "1" },
      content: "Create a generation plan from the provided design analysis.",
    }),
    aiConfig: {
      model: testEnv.ANTHROPIC_MODEL,
      temperature: testEnv.AI_TEMPERATURE,
      maxTokens: testEnv.AI_MAX_TOKENS,
      timeoutMs: testEnv.AI_TIMEOUT_MS,
    },
  };
}

describe("generationPlanCreationStage", () => {
  it("returns validated GenerationPlanV1 output with metadata", async () => {
    const provider = new MockAIProvider({
      rawText: createGenerationPlanFixtureJson(),
      inputTokens: 222,
      outputTokens: 333,
    });
    const context = createContext(provider);
    const result = await generationPlanCreationStage({ designAnalysis: designAnalysisFixture }, context);

    expect(result.status).toBe("completed");
    expect(result.output).toMatchObject({
      generationPlan: generationPlanFixture,
      planMetadata: {
        provider: "mock",
        promptVersion: "1.0.0",
      },
    });
    expect(provider.invocations[0]?.inputs.some((input) => "text" in input && input.text.includes("DesignAnalysisV1"))).toBe(true);
  });

  it("returns AI_RESPONSE_VERSION_MISSING when responseVersion is absent", async () => {
    const provider = new MockAIProvider({
      rawText: JSON.stringify({
        schemaVersion: "1",
        components: generationPlanFixture.components,
        files: generationPlanFixture.files,
        designTokens: generationPlanFixture.designTokens,
        dependencies: generationPlanFixture.dependencies,
        responsiveStrategy: "x",
        accessibilityStrategy: "y",
        confidenceWarnings: [],
      }),
    });
    const result = await generationPlanCreationStage(
      { designAnalysis: designAnalysisFixture },
      createContext(provider),
    );

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_RESPONSE_VERSION_MISSING);
  });

  it("returns PLAN_SCHEMA_INVALID for malformed JSON", async () => {
    const provider = new MockAIProvider({ rawText: "{bad" });
    const result = await generationPlanCreationStage(
      { designAnalysis: designAnalysisFixture },
      createContext(provider),
    );

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.PLAN_SCHEMA_INVALID);
  });

  it("returns UNSAFE_DEPENDENCY for disallowed packages", async () => {
    const provider = new MockAIProvider({
      rawText: createGenerationPlanFixtureJson({
        dependencies: { "left-pad": "1.0.0", react: "^18.3.1", "react-dom": "^18.3.1" },
      }),
    });
    const result = await generationPlanCreationStage(
      { designAnalysis: designAnalysisFixture },
      createContext(provider),
    );

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.UNSAFE_DEPENDENCY);
  });

  it("maps provider timeout errors to AI_TIMEOUT", async () => {
    const provider = new MockAIProvider({
      error: new AIProviderError("Timed out", ErrorCode.AI_TIMEOUT),
    });
    const result = await generationPlanCreationStage(
      { designAnalysis: designAnalysisFixture },
      createContext(provider),
    );

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_TIMEOUT);
  });

  it("does not log prompt content", async () => {
    const provider = new MockAIProvider({
      rawText: createGenerationPlanFixtureJson(),
    });
    const context = createContext(provider);
    await generationPlanCreationStage({ designAnalysis: designAnalysisFixture }, context);

    const logged = JSON.stringify([
      ...context.logger.info.mock.calls,
      ...context.logger.error.mock.calls,
    ]);
    expect(logged).not.toContain("Create a generation plan from the provided design analysis.");
  });
});
