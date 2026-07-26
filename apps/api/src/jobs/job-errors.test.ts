import { describe, expect, it } from "vitest";
import { APIError } from "openai";
import { ErrorCode } from "@reactify/shared";
import {
  classifyAIProviderError,
  classifyProviderError,
  isTransientError,
  PermanentJobError,
  TransientJobError,
} from "./job-errors.js";
import { classifyPipelineFailure } from "./pipeline-failure.js";
import { mapOpenAIError } from "../providers/openai-error-utils.js";

describe("pipeline and provider job failure classification", () => {
  it("classifies AI_PROVIDER_UNAVAILABLE as transient", () => {
    const error = classifyPipelineFailure(
      ErrorCode.AI_PROVIDER_UNAVAILABLE,
      "OpenAI server error.",
      { httpStatus: 500, providerErrorType: "server_error", providerRequestId: "req-1" },
    );

    expect(error).toBeInstanceOf(TransientJobError);
    expect(isTransientError(error)).toBe(true);
    expect(error.providerMetadata).toEqual({
      httpStatus: 500,
      providerErrorType: "server_error",
      providerRequestId: "req-1",
    });
  });

  it("classifies authentication and invalid request errors as permanent", () => {
    expect(
      isTransientError(classifyPipelineFailure(ErrorCode.AI_AUTHENTICATION_FAILED, "auth failed")),
    ).toBe(false);
    expect(
      isTransientError(classifyPipelineFailure(ErrorCode.AI_REQUEST_INVALID, "invalid request")),
    ).toBe(false);
  });

  it("classifies mapped HTTP 500 provider errors as transient with metadata", () => {
    const providerError = mapOpenAIError(
      new APIError(
        500,
        { message: "server error", type: "server_error" },
        "server error",
        new Headers({ "x-request-id": "req-500" }),
      ),
    );

    const classified = classifyAIProviderError(providerError);
    expect(classified).toBeInstanceOf(TransientJobError);
    expect(classified.providerMetadata?.httpStatus).toBe(500);
    expect(classified.providerMetadata?.providerErrorType).toBe("server_error");
  });

  it("classifies connection reset messages as transient", () => {
    const classified = classifyProviderError(new Error("read ECONNRESET"));
    expect(classified).toBeInstanceOf(TransientJobError);
    expect(classified.code).toBe(ErrorCode.AI_PROVIDER_UNAVAILABLE);
  });

  it("keeps unknown internal errors permanent", () => {
    const classified = classifyProviderError(new Error("unexpected"));
    expect(classified).toBeInstanceOf(PermanentJobError);
  });
});
