import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import { ErrorCode } from "@reactify/shared";
import { AIProviderError, isTimeoutLikeError } from "./provider-errors.js";

export interface SafeOpenAIErrorFields {
  httpStatus?: number;
  errorType?: string;
  errorCode?: string;
  message: string;
  requestId?: string;
  reachedOpenAI: boolean;
}

export function extractSafeOpenAIErrorFields(error: unknown): SafeOpenAIErrorFields {
  const candidate =
    error instanceof AIProviderError && error.providerCause !== undefined
      ? error.providerCause
      : error;

  if (candidate instanceof APIError) {
    return {
      httpStatus: candidate.status,
      errorType: candidate.type ?? undefined,
      errorCode: candidate.code ?? undefined,
      message: candidate.message,
      requestId: candidate.requestID ?? undefined,
      reachedOpenAI: candidate.status !== undefined,
    };
  }

  return {
    message: candidate instanceof Error ? candidate.message : String(candidate),
    reachedOpenAI: false,
  };
}

function isQuotaOrBillingError(error: APIError): boolean {
  if (error.status === 402) {
    return true;
  }

  const code = (error.code ?? "").toLowerCase();
  const message = error.message.toLowerCase();
  return (
    code.includes("insufficient_quota") ||
    code.includes("billing") ||
    message.includes("insufficient quota") ||
    message.includes("billing") ||
    message.includes("credit")
  );
}

function isRetryableServerHttpStatus(status: number | undefined): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

export function isRetryableOpenAIHttpStatus(status: number | undefined): boolean {
  if (status === undefined) {
    return false;
  }

  if (status === 429) {
    return true;
  }

  return isRetryableServerHttpStatus(status);
}

export function isRetryableAIProviderError(error: AIProviderError): boolean {
  if (
    error.errorCode === ErrorCode.AI_TIMEOUT ||
    error.errorCode === ErrorCode.AI_RATE_LIMITED ||
    error.errorCode === ErrorCode.AI_PROVIDER_UNAVAILABLE
  ) {
    return true;
  }

  const cause = error.providerCause;
  if (cause instanceof APIConnectionError || cause instanceof APIConnectionTimeoutError) {
    return true;
  }

  if (cause instanceof APIError && isRetryableOpenAIHttpStatus(cause.status)) {
    return true;
  }

  const message = error.message.toLowerCase();
  if (message.includes("econnreset") || message.includes("connection reset")) {
    return true;
  }

  return false;
}

function isModelNotFoundError(error: APIError): boolean {
  const code = (error.code ?? "").toLowerCase();
  return error.status === 404 || code === "model_not_found";
}

export function mapOpenAIError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  if (error instanceof APIUserAbortError || isTimeoutLikeError(error)) {
    return new AIProviderError("OpenAI request timed out.", ErrorCode.AI_TIMEOUT, error);
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new AIProviderError("OpenAI request timed out.", ErrorCode.AI_TIMEOUT, error);
  }

  if (error instanceof AuthenticationError || (error instanceof APIError && error.status === 401)) {
    return new AIProviderError("OpenAI authentication failed.", ErrorCode.AI_AUTHENTICATION_FAILED, error);
  }

  if (error instanceof RateLimitError || (error instanceof APIError && error.status === 429)) {
    return new AIProviderError("OpenAI rate limit reached.", ErrorCode.AI_RATE_LIMITED, error);
  }

  if (error instanceof PermissionDeniedError || (error instanceof APIError && error.status === 403)) {
    return new AIProviderError("OpenAI access denied.", ErrorCode.AI_ACCESS_DENIED, error);
  }

  if (error instanceof NotFoundError || (error instanceof APIError && isModelNotFoundError(error))) {
    return new AIProviderError("OpenAI model is not available.", ErrorCode.AI_MODEL_NOT_AVAILABLE, error);
  }

  if (error instanceof APIError && isQuotaOrBillingError(error)) {
    return new AIProviderError("OpenAI quota or billing limit reached.", ErrorCode.AI_QUOTA_EXCEEDED, error);
  }

  if (error instanceof BadRequestError || (error instanceof APIError && error.status === 400)) {
    return new AIProviderError("OpenAI request was invalid.", ErrorCode.AI_REQUEST_INVALID, error);
  }

  if (error instanceof APIConnectionError) {
    return new AIProviderError("OpenAI connection failed.", ErrorCode.AI_PROVIDER_UNAVAILABLE, error);
  }

  if (error instanceof APIError && isRetryableServerHttpStatus(error.status)) {
    return new AIProviderError("OpenAI server error.", ErrorCode.AI_PROVIDER_UNAVAILABLE, error);
  }

  if (error instanceof APIError) {
    return new AIProviderError("OpenAI request failed.", ErrorCode.AI_ERROR, error);
  }

  return new AIProviderError("OpenAI request failed.", ErrorCode.AI_ERROR, error);
}
