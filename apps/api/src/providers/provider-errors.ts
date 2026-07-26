import { ErrorCode } from "@reactify/shared";

export type AIProviderErrorCode =
  | typeof ErrorCode.AI_TIMEOUT
  | typeof ErrorCode.AI_ERROR
  | typeof ErrorCode.AI_PROVIDER_NOT_CONFIGURED
  | typeof ErrorCode.AI_AUTHENTICATION_FAILED
  | typeof ErrorCode.AI_QUOTA_EXCEEDED
  | typeof ErrorCode.AI_ACCESS_DENIED
  | typeof ErrorCode.AI_MODEL_NOT_AVAILABLE
  | typeof ErrorCode.AI_RATE_LIMITED
  | typeof ErrorCode.AI_REQUEST_INVALID
  | typeof ErrorCode.AI_RESPONSE_INVALID
  | typeof ErrorCode.AI_PROVIDER_UNAVAILABLE;

export function isAIProviderError(error: unknown): error is AIProviderError {
  return (
    error instanceof AIProviderError ||
    (error instanceof Error &&
      error.name === "AIProviderError" &&
      "errorCode" in error &&
      typeof (error as AIProviderError).errorCode === "string")
  );
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly errorCode: AIProviderErrorCode,
    readonly providerCause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("timeout") ||
    error.message.toLowerCase().includes("timed out") ||
    error.message.toLowerCase().includes("aborted")
  );
}
