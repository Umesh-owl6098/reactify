import { describe, expect, it, vi } from "vitest";
import {
  MockAIProvider,
  createGeneratedProjectFixtureJson,
  designAnalysisFixture,
  generatedProjectFixture,
  generationPlanFixture,
} from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import { APIError } from "openai";
import { AIProviderError } from "../../providers/provider-errors.js";
import { reactProjectGenerationStage } from "./reactProjectGeneration.js";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import type { PipelineContext } from "@reactify/shared";
import { testEnv } from "../../test/helpers.js";
import { UsageLimitError } from "../../usage/usage-service.js";
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
    loadPrompt: (name) => ({
      meta: { promptVersion: "1.0.0", schemaVersion: "1" },
      content:
        name === "react-project-generation-repair"
          ? "Repair the generated project JSON."
          : "Generate a React project from the confirmed plan.",
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

  it("returns PROVIDER_RESPONSE_NOT_JSON for malformed JSON", async () => {
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(new MockAIProvider({ responses: ["{bad", "{bad"] })),
    );
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.PROVIDER_RESPONSE_NOT_JSON);
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

  it("preserves safe provider metadata on classified failures", async () => {
    const cause = new APIError(
      429,
      { message: "secret request content", type: "rate_limit_error", code: "rate_limit_exceeded" },
      "secret request content",
      new Headers({ "x-request-id": "req_123" }),
    );
    const context = createContext(
      new MockAIProvider({
        error: new AIProviderError("OpenAI rate limit reached.", ErrorCode.AI_RATE_LIMITED, cause),
      }),
    );
    const result = await reactProjectGenerationStage(createState(), context);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: ErrorCode.AI_RATE_LIMITED,
      providerMetadata: {
        httpStatus: 429,
        providerErrorType: "rate_limit_error",
        providerErrorCode: "rate_limit_exceeded",
        providerMessage: "OpenAI rate limit reached.",
      },
    });
    expect(JSON.stringify(context.logger.error.mock.calls)).not.toContain("secret request content");
  });

  it("preserves UsageLimitError codes without provider metadata", async () => {
    const result = await reactProjectGenerationStage(
      createState(),
      createContext(
        new MockAIProvider({
          error: new UsageLimitError(
            ErrorCode.AI_MONTHLY_BUDGET_EXCEEDED,
            "Monthly AI budget exceeded.",
          ),
        }),
      ),
    );

    expect(result).toMatchObject({
      status: "failed",
      errorCode: ErrorCode.AI_MONTHLY_BUDGET_EXCEEDED,
      errorMessage: "Monthly AI budget exceeded.",
    });
    expect(result.providerMetadata).toBeUndefined();
  });

  it("classifies generic failures without logging their possibly sensitive message", async () => {
    const context = createContext(
      new MockAIProvider({ error: new Error("prompt and generated source secret") }),
    );
    const result = await reactProjectGenerationStage(createState(), context);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: ErrorCode.AI_ERROR,
      errorMessage: "React project generation provider failed unexpectedly.",
    });
    expect(JSON.stringify(context.logger.error.mock.calls)).not.toContain(
      "prompt and generated source secret",
    );
  });

  it("falls back only when structured response format is unsupported", async () => {
    const provider = new MockAIProvider();
    const invoke = vi
      .spyOn(provider, "invoke")
      .mockRejectedValueOnce(
        new AIProviderError(
          "OpenAI model does not support the requested response format.",
          ErrorCode.AI_RESPONSE_FORMAT_UNSUPPORTED,
        ),
      )
      .mockResolvedValueOnce({
        rawText: createGeneratedProjectFixtureJson(),
        inputTokens: 100,
        outputTokens: 500,
        totalTokens: 600,
        latencyMs: 50,
        model: "mock-model-v1",
        provider: "mock",
        usageSource: "provider_reported",
      });
    const result = await reactProjectGenerationStage(createState(), createContext(provider));

    expect(result.status).toBe("completed");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0]?.[1].responseFormat?.type).toBe("json_schema");
    expect(invoke.mock.calls[1]?.[1].responseFormat?.type).toBe("json_object");
  });

  it("does not fall back for other invalid provider requests", async () => {
    const provider = new MockAIProvider({
      error: new AIProviderError("OpenAI request was invalid.", ErrorCode.AI_REQUEST_INVALID),
    });
    const result = await reactProjectGenerationStage(createState(), createContext(provider));

    expect(result.errorCode).toBe(ErrorCode.AI_REQUEST_INVALID);
    expect(provider.invocations).toHaveLength(1);
  });

  it("attempts schema repair once for invalid JSON and succeeds on repair response", async () => {
    const provider = new MockAIProvider({
      responses: ["{bad", createGeneratedProjectFixtureJson()],
    });
    const context = createContext(provider);
    const result = await reactProjectGenerationStage(createState(), context);

    expect(result.status).toBe("completed");
    expect(provider.invocations).toHaveLength(2);
  });

  it("returns detailed schema failure after repair is exhausted", async () => {
    const provider = new MockAIProvider({
      responses: [
        createGeneratedProjectFixtureJson({ projectName: undefined }),
        createGeneratedProjectFixtureJson({ summary: undefined }),
      ],
    });
    const result = await reactProjectGenerationStage(createState(), createContext(provider));

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID);
    expect(provider.invocations).toHaveLength(2);
  });

  it("does not log prompt content", async () => {
    const context = createContext(new MockAIProvider({ rawText: createGeneratedProjectFixtureJson() }));
    await reactProjectGenerationStage(createState(), context);
    const logged = JSON.stringify([...context.logger.info.mock.calls, ...context.logger.error.mock.calls]);
    expect(logged).not.toContain("Generate a React project from the confirmed plan.");
  });

  it("does not log generated response previews", async () => {
    const marker = "FULL_GENERATED_SOURCE_MUST_NOT_BE_LOGGED";
    const context = createContext(
      new MockAIProvider({ responses: [`{bad ${marker}`, `{bad ${marker}`] }),
    );
    await reactProjectGenerationStage(createState(), context);

    const logged = JSON.stringify([
      ...context.logger.info.mock.calls,
      ...context.logger.warn.mock.calls,
      ...context.logger.error.mock.calls,
    ]);
    expect(logged).not.toContain(marker);
    expect(logged).not.toContain("responsePreview");
  });
});
