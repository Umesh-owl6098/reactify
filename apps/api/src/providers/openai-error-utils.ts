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
  const publicMessage =
    error instanceof AIProviderError
      ? error.message
      : "OpenAI provider request failed.";
  const candidate =
    error instanceof AIProviderError && error.providerCause !== undefined
      ? error.providerCause
      : error;

  if (candidate instanceof APIError) {
    return {
      httpStatus: error instanceof AIProviderError ? error.safeMetadata?.httpStatus ?? candidate.status : candidate.status,
      errorType: error instanceof AIProviderError ? error.safeMetadata?.errorType ?? candidate.type ?? undefined : candidate.type ?? undefined,
      errorCode: error instanceof AIProviderError ? error.safeMetadata?.providerErrorCode ?? candidate.code ?? undefined : candidate.code ?? undefined,
      message: publicMessage,
      requestId:
        error instanceof AIProviderError
          ? error.safeMetadata?.providerRequestId ?? candidate.requestID ?? undefined
          : candidate.requestID ?? undefined,
      reachedOpenAI:
        error instanceof AIProviderError
          ? error.safeMetadata?.reachedProvider ?? candidate.status !== undefined
          : candidate.status !== undefined,
    };
  }

  if (error instanceof AIProviderError && error.safeMetadata) {
    return {
      httpStatus: error.safeMetadata.httpStatus,
      errorType: error.safeMetadata.errorType,
      errorCode: error.safeMetadata.providerErrorCode,
      message: publicMessage,
      requestId: error.safeMetadata.providerRequestId,
      reachedOpenAI: error.safeMetadata.reachedProvider ?? false,
    };
  }

  return {
    message: publicMessage,
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

function isContextLimitError(error: APIError): boolean {
  const code = (error.code ?? "").toLowerCase();
  const message = error.message.toLowerCase();
  return (
    code === "context_length_exceeded" ||
    code === "max_context_length_exceeded" ||
    message.includes("context length") ||
    message.includes("context window")
  );
}

export function isResponseFormatUnsupportedOpenAIError(error: unknown): boolean {
  if (
    error instanceof AIProviderError &&
    error.errorCode === ErrorCode.AI_RESPONSE_FORMAT_UNSUPPORTED
  ) {
    return true;
  }

  const candidate =
    error instanceof AIProviderError && error.providerCause !== undefined
      ? error.providerCause
      : error;
  if (!(candidate instanceof APIError) || candidate.status !== 400) {
    return false;
  }

  const code = (candidate.code ?? "").toLowerCase();
  const message = candidate.message.toLowerCase();
  const namesResponseFormat =
    message.includes("response_format") ||
    message.includes("text.format") ||
    message.includes("json_schema");
  const saysUnsupported =
    code === "unsupported_parameter" ||
    message.includes("not supported") ||
    message.includes("unsupported");
  return namesResponseFormat && saysUnsupported;
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

  if (error instanceof APIError && isQuotaOrBillingError(error)) {
    return new AIProviderError("OpenAI quota or billing limit reached.", ErrorCode.AI_QUOTA_EXCEEDED, error);
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

  if (error instanceof APIError && isContextLimitError(error)) {
    return new AIProviderError("OpenAI context limit exceeded.", ErrorCode.AI_CONTEXT_LIMIT_EXCEEDED, error);
  }

  if (isResponseFormatUnsupportedOpenAIError(error)) {
    return new AIProviderError(
      "OpenAI model does not support the requested response format.",
      ErrorCode.AI_RESPONSE_FORMAT_UNSUPPORTED,
      error,
    );
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
