import { describe, expect, it, vi } from "vitest";
import { designAnalysisFixture } from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import {
  OpenAIProvider,
  type OpenAIResponsesClientLike,
} from "./OpenAIProvider.js";
import { extractSafeOpenAIErrorFields, mapOpenAIError } from "./openai-error-utils.js";
import { AIProviderError } from "./provider-errors.js";
import { createAIProvider } from "./providerFactory.js";
import { resolveMockFailureStage } from "../pipeline/mock-failure-stage.js";

function createMockClient(
  response: Awaited<ReturnType<OpenAIResponsesClientLike["responses"]["create"]>>,
  createImpl?: OpenAIResponsesClientLike["responses"]["create"],
): OpenAIResponsesClientLike {
  return {
    responses: {
      create: createImpl ?? vi.fn().mockResolvedValue(response),
    },
  };
}

function createApiError<T extends new (...args: never[]) => Error>(
  ErrorClass: T,
  status: number,
  code: string,
  message: string,
): InstanceType<T> {
  return new ErrorClass(status, { message, type: "invalid_request_error", code }, message, new Headers());
}

const validDesignAnalysisJson = JSON.stringify(designAnalysisFixture);

describe("OpenAIProvider", () => {
  it("builds Responses API input with a user message containing text and image data URLs", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "resp_123",
      model: "gpt-4o",
      output_text: validDesignAnalysisJson,
      usage: { input_tokens: 120, output_tokens: 340, total_tokens: 460 },
    });
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await provider.invoke(
      [{ text: "Analyze this screenshot" }, { base64: "abc123", mimeType: "image/png" }],
      {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        maxTokens: 4096,
        timeoutMs: 5000,
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Analyze this screenshot" },
              { type: "input_image", image_url: "data:image/png;base64,abc123", detail: "auto" },
            ],
          },
        ],
        text: { format: { type: "json_object" } },
      }),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it("returns usage metadata from a valid design-analysis response", async () => {
    const provider = new OpenAIProvider(
      createMockClient({
        id: "resp_123",
        model: "gpt-4o",
        output_text: validDesignAnalysisJson,
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      }),
      "gpt-4o",
    );

    const result = await provider.invoke([{ text: "prompt" }], {
      promptVersion: "1.0.0",
      model: "gpt-4o",
      temperature: 0.1,
      timeoutMs: 1000,
    });

    expect(result.rawText).toBe(validDesignAnalysisJson);
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
    expect(result.totalTokens).toBe(30);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
    expect(result.providerRequestId).toBe("resp_123");
  });

  it("maps empty responses to AI_RESPONSE_INVALID", async () => {
    const provider = new OpenAIProvider(
      createMockClient({
        id: "resp_empty",
        model: "gpt-4o",
        output_text: "   ",
      }),
      "gpt-4o",
    );

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_RESPONSE_INVALID });
  });

  it("maps authentication failures to AI_AUTHENTICATION_FAILED", async () => {
    const create = vi.fn().mockRejectedValue(
      createApiError(AuthenticationError, 401, "invalid_api_key", "Incorrect API key provided"),
    );
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_AUTHENTICATION_FAILED });
  });

  it("maps quota and billing failures to AI_QUOTA_EXCEEDED", async () => {
    const create = vi.fn().mockRejectedValue(
      createApiError(BadRequestError, 402, "insufficient_quota", "You exceeded your current quota."),
    );
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_QUOTA_EXCEEDED });
  });

  it("maps permission failures to AI_ACCESS_DENIED", async () => {
    const create = vi.fn().mockRejectedValue(
      createApiError(PermissionDeniedError, 403, "access_denied", "Project access denied."),
    );
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_ACCESS_DENIED });
  });

  it("maps model not found failures to AI_MODEL_NOT_AVAILABLE", async () => {
    const create = vi.fn().mockRejectedValue(
      createApiError(NotFoundError, 404, "model_not_found", "The model does not exist."),
    );
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_MODEL_NOT_AVAILABLE });
  });

  it("maps rate limits to AI_RATE_LIMITED", async () => {
    const create = vi.fn().mockRejectedValue(
      createApiError(RateLimitError, 429, "rate_limit_exceeded", "Rate limit reached."),
    );
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_RATE_LIMITED });
  });

  it("maps invalid requests to AI_REQUEST_INVALID", async () => {
    const create = vi.fn().mockRejectedValue(
      createApiError(BadRequestError, 400, "invalid_request_error", "Invalid input format."),
    );
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_REQUEST_INVALID });
  });

  it("maps connection timeouts to AI_TIMEOUT", async () => {
    const create = vi.fn().mockRejectedValue(new APIConnectionTimeoutError({ message: "Request timed out." }));
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_TIMEOUT });
  });

  it("maps abort signals to AI_TIMEOUT", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_TIMEOUT });
  });

  it("maps connection failures to AI_PROVIDER_UNAVAILABLE", async () => {
    const create = vi.fn().mockRejectedValue(new APIConnectionError({ message: "Connection failed." }));
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_PROVIDER_UNAVAILABLE });
  });

  it("maps generic provider failures to AI_ERROR", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network down"));
    const provider = new OpenAIProvider(createMockClient({} as never, create), "gpt-4o");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "gpt-4o",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.AI_ERROR });
  });
});

describe("mapOpenAIError", () => {
  it("extracts safe OpenAI error fields without leaking secrets", () => {
    const error = createApiError(BadRequestError, 400, "invalid_request_error", "Invalid input format.");
    const mapped = mapOpenAIError(error);
    const safe = extractSafeOpenAIErrorFields(mapped);

    expect(mapped).toBeInstanceOf(AIProviderError);
    expect(safe).toEqual({
      httpStatus: 400,
      errorType: "invalid_request_error",
      errorCode: "invalid_request_error",
      message: expect.stringContaining("Invalid input format."),
      requestId: undefined,
      reachedOpenAI: true,
    });
  });
});

describe("createAIProvider", () => {
  const baseEnv = {
    DATABASE_URL: "postgresql://reactify:reactify_dev@localhost:5434/reactify",
    NODE_ENV: "development" as const,
  };

  it("selects OpenAIProvider when AI_PROVIDER=openai", () => {
    const provider = createAIProvider({
      ...baseEnv,
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-4o",
    } as never);

    expect(provider.providerName).toBe("openai");
    expect(provider.defaultModel).toBe("gpt-4o");
  });

  it("throws AI_PROVIDER_NOT_CONFIGURED when OPENAI_API_KEY is missing", () => {
    expect(() =>
      createAIProvider({
        ...baseEnv,
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "gpt-4o",
      } as never),
    ).toThrow(AIProviderError);

    try {
      createAIProvider({
        ...baseEnv,
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "gpt-4o",
      } as never);
    } catch (error) {
      expect(error).toMatchObject({ errorCode: ErrorCode.AI_PROVIDER_NOT_CONFIGURED });
    }
  });

  it("does not enable mock failure injection in openai mode", () => {
    expect(
      resolveMockFailureStage(undefined),
    ).toBeUndefined();
    expect(
      createAIProvider({
        ...baseEnv,
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-4o",
        MOCK_AI_FAILURE_STAGE: undefined,
      } as never).providerName,
    ).toBe("openai");
  });
});
