import { describe, expect, it } from "vitest";
import { APIError, AuthenticationError, BadRequestError } from "openai";
import { ErrorCode } from "@reactify/shared";
import {
  extractSafeOpenAIErrorFields,
  isRetryableAIProviderError,
  isRetryableOpenAIHttpStatus,
  mapOpenAIError,
} from "./openai-error-utils.js";
import { AIProviderError } from "./provider-errors.js";

function createApiError(status: number, type: string, message: string, code?: string): APIError {
  return new APIError(status, { message, type, code }, message, new Headers());
}

describe("OpenAI retry classification", () => {
  it.each([500, 502, 503, 504, 429])("treats HTTP %i as retryable", (status) => {
    expect(isRetryableOpenAIHttpStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 402])("treats HTTP %i as non-retryable", (status) => {
    expect(isRetryableOpenAIHttpStatus(status)).toBe(false);
  });

  it("maps HTTP 500 to AI_PROVIDER_UNAVAILABLE", () => {
    const apiError = createApiError(
      500,
      "server_error",
      "The server had an error processing your request.",
    );
    const mapped = mapOpenAIError(apiError);

    expect(mapped.errorCode).toBe(ErrorCode.AI_PROVIDER_UNAVAILABLE);
    expect(isRetryableAIProviderError(mapped)).toBe(true);
  });

  it("maps HTTP 401 to a permanent authentication error", () => {
    const mapped = mapOpenAIError(new AuthenticationError(undefined, undefined, "Invalid API key", undefined));
    expect(mapped.errorCode).toBe(ErrorCode.AI_AUTHENTICATION_FAILED);
    expect(isRetryableAIProviderError(mapped)).toBe(false);
  });

  it("maps HTTP 400 to a permanent invalid request error", () => {
    const mapped = mapOpenAIError(
      new BadRequestError(undefined, undefined, "Invalid schema", undefined),
    );
    expect(mapped.errorCode).toBe(ErrorCode.AI_REQUEST_INVALID);
    expect(isRetryableAIProviderError(mapped)).toBe(false);
  });

  it("extracts safe provider metadata without leaking secrets", () => {
    const mapped = mapOpenAIError(
      createApiError(
        500,
        "server_error",
        "500 The server had an error processing your request. (request ID abc-123)",
      ),
    );
    const safe = extractSafeOpenAIErrorFields(mapped);

    expect(safe.httpStatus).toBe(500);
    expect(safe.errorType).toBe("server_error");
    expect(safe.message).toBe("OpenAI server error.");
    expect(JSON.stringify(safe)).not.toMatch(/sk-/);
  });

  it("classifies providerCause HTTP 500 on AI_ERROR as retryable", () => {
    const error = new AIProviderError(
      "OpenAI request failed.",
      ErrorCode.AI_ERROR,
      createApiError(500, "server_error", "server error"),
    );

    expect(isRetryableAIProviderError(error)).toBe(true);
  });
});
