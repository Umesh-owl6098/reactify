import { describe, expect, it, vi } from "vitest";
import {
  MockAIProvider,
  createGeneratedProjectFixtureJson,
  designAnalysisFixture,
  generatedProjectFixture,
  generationPlanFixture,
} from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
import { reactProjectGenerationStage } from "./reactProjectGeneration.js";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import type { PipelineContext } from "@reactify/shared";
import { testEnv } from "../../test/helpers.js";
import type { PipelineState } from "../types.js";

function createState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    imageId: "770e8400-e29b-41d4-a716-446655440000",
    designAnalysis: designAnalysisFixture,
    generationPlan: generationPlanFixture,
    planConfirmed: true,
    ...overrides,
  };
}

function createContext(provider: MockAIProvider): PipelineContext {
  return {
    generationId: "550e8400-e29b-41d4-a716-446655440000",
    projectId: "660e8400-e29b-41d4-a716-446655440000",
    imageId: "770e8400-e29b-41d4-a716-446655440000",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    flags: DEFAULT_FEATURE_FLAGS,
    aiProvider: provider,
    loadPrompt: () => ({
      meta: { promptVersion: "1.0.0", schemaVersion: "1" },
      content: "Generate a React project from the confirmed plan.",
    }),
    aiConfig: {
      model: testEnv.ANTHROPIC_MODEL,
      temperature: testEnv.AI_TEMPERATURE,
      maxTokens: testEnv.AI_MAX_TOKENS,
      timeoutMs: testEnv.AI_TIMEOUT_MS,
    },
  };
}

describe("reactProjectGenerationStage", () => {
  it("returns validated GeneratedProjectV1 output with metadata", async () => {
    const provider = new MockAIProvider({
      rawText: createGeneratedProjectFixtureJson(),
      inputTokens: 300,
      outputTokens: 900,
    });
    const context = createContext(provider);
    const result = await reactProjectGenerationStage(createState(), context);

    expect(result.status).toBe("completed");
    expect(result.output).toMatchObject({
      generatedProject: generatedProjectFixture,
      projectMetadata: { provider: "mock", promptVersion: "1.0.0" },
    });
    expect(provider.invocations[0]?.inputs.some((input) => "text" in input && input.text.includes("GenerationPlanV1"))).toBe(true);
  });

  it("returns GENERATED_PROJECT_SCHEMA_INVALID for malformed JSON", async () => {
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(new MockAIProvider({ rawText: "{bad" })),
    );
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID);
  });

  it("returns AI_RESPONSE_VERSION_MISSING when responseVersion is absent", async () => {
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(
        new MockAIProvider({
          rawText: createGeneratedProjectFixtureJson({ responseVersion: undefined }),
        }),
      ),
    );
    expect(result.errorCode).toBe(ErrorCode.AI_RESPONSE_VERSION_MISSING);
  });

  it("returns UNSAFE_FILE_PATH for traversal paths", async () => {
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(
        new MockAIProvider({
          rawText: createGeneratedProjectFixtureJson({
            files: [{ ...generatedProjectFixture.files[0], path: "../secret.ts" }],
          }),
        }),
      ),
    );
    expect(result.errorCode).toBe(ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID);
  });

  it("returns UNSAFE_DEPENDENCY for disallowed packages", async () => {
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(
        new MockAIProvider({
          rawText: createGeneratedProjectFixtureJson({
            dependencies: { "left-pad": "1.0.0", react: "^18.3.1", "react-dom": "^18.3.1" },
          }),
        }),
      ),
    );
    expect(result.errorCode).toBe(ErrorCode.UNSAFE_DEPENDENCY);
  });

  it("returns UNSAFE_SOURCE_CODE for prohibited patterns", async () => {
    const unsafeFile = {
      ...generatedProjectFixture.files.find((file) => file.path === "src/App.tsx")!,
      content: "eval('alert(1)')",
    };
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(
        new MockAIProvider({
          rawText: createGeneratedProjectFixtureJson({
            files: generatedProjectFixture.files.map((file) =>
              file.path === "src/App.tsx" ? unsafeFile : file,
            ),
          }),
        }),
      ),
    );
    expect(result.errorCode).toBe(ErrorCode.UNSAFE_SOURCE_CODE);
  });

  it("maps provider timeout errors to AI_TIMEOUT", async () => {
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(new MockAIProvider({ error: new AIProviderError("Timed out", ErrorCode.AI_TIMEOUT) })),
    );
    expect(result.errorCode).toBe(ErrorCode.AI_TIMEOUT);
  });

  it("does not log prompt content", async () => {
    const context = createContext(new MockAIProvider({ rawText: createGeneratedProjectFixtureJson() }));
    await reactProjectGenerationStage(createState(), context);
    const logged = JSON.stringify([...context.logger.info.mock.calls, ...context.logger.error.mock.calls]);
    expect(logged).not.toContain("Generate a React project from the confirmed plan.");
  });
});
