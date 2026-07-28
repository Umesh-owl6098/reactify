import { mkdtemp } from "node:fs/promises";
import { LocalStorageProvider } from "../../lib/storage/localStorageProvider.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import {
  MockAIProvider,
  createDesignAnalysisFixtureJson,
  designAnalysisFixture,
} from "@reactify/test-utils";
import { AIProviderError } from "../../providers/provider-errors.js";
import { ImageStorage } from "../../lib/imageStorage.js";
import { createImagePreparationStage } from "./imagePreparation.js";
import { designAnalysisStage } from "./designAnalysis.js";
import { createTestImage, testEnv } from "../../test/helpers.js";
import type { PipelineContext } from "@reactify/shared";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";

function createContext(
  aiProvider: MockAIProvider,
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
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
    aiProvider,
    loadPrompt: () => ({
      meta: { promptVersion: "1.0.0", schemaVersion: "1" },
      content: "Analyze the screenshot and return JSON only.",
    }),
    aiConfig: {
      model: testEnv.ANTHROPIC_MODEL,
      temperature: testEnv.AI_TEMPERATURE,
      maxTokens: testEnv.AI_MAX_TOKENS,
      timeoutMs: testEnv.AI_TIMEOUT_MS,
    },
    ...overrides,
  };
}

describe("designAnalysisStage", () => {
  let storageDir = "";
  let imageStorage: ImageStorage;
  let imageId = "";

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "reactify-design-analysis-"));
    imageStorage = new ImageStorage(new LocalStorageProvider(storageDir));
    imageId = await createTestImage(storageDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns validated DesignAnalysisV1 output with metadata", async () => {
    const provider = new MockAIProvider({
      rawText: createDesignAnalysisFixtureJson(),
      inputTokens: 111,
      outputTokens: 222,
      latencyMs: 99,
    });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    expect(prepared.status).toBe("completed");

    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("completed");
    expect(result.output).toMatchObject({
      designAnalysis: designAnalysisFixture,
      analysisMetadata: {
        provider: "mock",
        model: "mock-model-v1",
        promptVersion: "1.0.0",
        schemaVersion: "1",
        inputTokens: 111,
        outputTokens: 222,
        latencyMs: 99,
        temperature: testEnv.AI_TEMPERATURE,
      },
    });
    expect(provider.invocations[0]?.options.responseFormat).toMatchObject({
      type: "json_schema",
      name: "design_analysis_v1",
      strict: true,
    });
  });

  it("returns AI_RESPONSE_VERSION_MISSING when schemaVersion is absent", async () => {
    const provider = new MockAIProvider({
      rawText: JSON.stringify({
        responseVersion: "2026-01-01T00:00:00.000Z",
        layoutHierarchy: "Header",
        componentHierarchy: [],
        colors: [],
        typography: [],
        spacing: [],
      }),
    });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_RESPONSE_VERSION_MISSING);
  });

  it("returns AI_RESPONSE_VERSION_MISSING when responseVersion is absent", async () => {
    const provider = new MockAIProvider({
      rawText: JSON.stringify({
        schemaVersion: "1",
        layoutHierarchy: "Header",
        componentHierarchy: [],
        colors: [],
        typography: [],
        spacing: [],
      }),
    });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_RESPONSE_VERSION_MISSING);
  });

  it("returns ANALYSIS_SCHEMA_INVALID for malformed JSON", async () => {
    const provider = new MockAIProvider({ rawText: "{bad json" });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.ANALYSIS_SCHEMA_INVALID);
  });

  it("handles markdown-fenced JSON from the provider", async () => {
    const provider = new MockAIProvider({
      rawText: `\`\`\`json\n${createDesignAnalysisFixtureJson()}\n\`\`\``,
    });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("completed");
  });

  it("maps provider timeout errors to AI_TIMEOUT", async () => {
    const provider = new MockAIProvider({
      error: new AIProviderError("Timed out", ErrorCode.AI_TIMEOUT),
    });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_TIMEOUT);
  });

  it("maps provider request errors to AI_REQUEST_INVALID", async () => {
    const provider = new MockAIProvider({
      error: new AIProviderError("OpenAI request was invalid.", ErrorCode.AI_REQUEST_INVALID),
    });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_REQUEST_INVALID);
    expect(result.errorMessage).toBe("OpenAI request was invalid.");
  });

  it("maps unexpected provider failures to AI_ERROR", async () => {
    const provider = new MockAIProvider({ error: new Error("boom") });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    const result = await designAnalysisStage(prepared.output, context);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_ERROR);
  });

  it("returns IMAGE_NOT_FOUND when prepared image input is missing", async () => {
    const provider = new MockAIProvider();
    const context = createContext(provider);
    const result = await designAnalysisStage({ imageId }, context);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.IMAGE_NOT_FOUND);
  });

  it("does not log base64 image content or secrets", async () => {
    const provider = new MockAIProvider({ rawText: createDesignAnalysisFixtureJson() });
    const context = createContext(provider);
    const prepared = await createImagePreparationStage(imageStorage)({ imageId }, context);
    await designAnalysisStage(prepared.output, context);

    const logged = [
      ...context.logger.info.mock.calls,
      ...context.logger.warn.mock.calls,
      ...context.logger.error.mock.calls,
    ]
      .flatMap((call) => call.slice(1))
      .map((meta) => JSON.stringify(meta ?? {}))
      .join(" ");

    expect(logged).not.toContain("iVBORw0KGgo");
    expect(logged).not.toMatch(/sk-ant-/);
  });
});

describe("createImagePreparationStage", () => {
  it("returns IMAGE_NOT_FOUND when the uploaded image is missing", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reactify-image-prep-"));
    const imageStorage = new ImageStorage(new LocalStorageProvider(storageDir));
    const context = createContext(new MockAIProvider());

    const result = await createImagePreparationStage(imageStorage)(
      { imageId: "550e8400-e29b-41d4-a716-446655440000" },
      context,
    );

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.IMAGE_NOT_FOUND);
  });
});
