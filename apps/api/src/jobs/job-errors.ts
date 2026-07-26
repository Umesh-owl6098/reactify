import { ErrorCode } from "@reactify/shared";
import { isAIProviderError, type AIProviderError } from "../providers/provider-errors.js";
import {
  extractSafeOpenAIErrorFields,
  isRetryableAIProviderError,
} from "../providers/openai-error-utils.js";
import type { ProviderFailureMetadata } from "./provider-failure-metadata.js";
import { toProviderFailureMetadata } from "./provider-failure-metadata.js";

export class JobError extends Error {
  readonly providerMetadata?: ProviderFailureMetadata;

  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean = false,
    readonly permanent: boolean = false,
    providerMetadata?: ProviderFailureMetadata,
  ) {
    super(message);
    this.name = "JobError";
    this.providerMetadata = providerMetadata;
  }
}

export class TransientJobError extends JobError {
  constructor(code: string, message: string, providerMetadata?: ProviderFailureMetadata) {
    super(code, message, true, false, providerMetadata);
    this.name = "TransientJobError";
  }
}

export class PermanentJobError extends JobError {
  constructor(code: string, message: string, providerMetadata?: ProviderFailureMetadata) {
    super(code, message, false, true, providerMetadata);
    this.name = "PermanentJobError";
  }
}

export class JobCancelledError extends JobError {
  constructor(code: string = ErrorCode.JOB_CANCELLED, message = "Job was cancelled.") {
    super(code, message, false, true);
    this.name = "JobCancelledError";
  }
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof TransientJobError) {
    return true;
  }
  if (error instanceof PermanentJobError || error instanceof JobCancelledError) {
    return false;
  }
  if (error instanceof JobError) {
    return error.retryable;
  }
  return false;
}

export function classifyAIProviderError(error: AIProviderError): JobError {
  const metadata = toProviderFailureMetadata(extractSafeOpenAIErrorFields(error));
  if (isRetryableAIProviderError(error)) {
    return new TransientJobError(error.errorCode, error.message, metadata);
  }

  return new PermanentJobError(error.errorCode, error.message, metadata);
}

export function classifyProviderError(error: unknown): JobError {
  if (error instanceof JobError) {
    return error;
  }

  if (isAIProviderError(error)) {
    return classifyAIProviderError(error);
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new TransientJobError(ErrorCode.AI_TIMEOUT, "AI request timed out.");
  }

  if (lower.includes("rate limit") || lower.includes("429")) {
    return new TransientJobError(ErrorCode.AI_RATE_LIMITED, "AI provider rate limit reached.");
  }

  if (
    lower.includes("connection") ||
    lower.includes("econnreset") ||
    lower.includes("connection reset") ||
    lower.includes("network")
  ) {
    return new TransientJobError(ErrorCode.AI_PROVIDER_UNAVAILABLE, "Temporary connection failure.");
  }

  return new PermanentJobError(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred.");
}
