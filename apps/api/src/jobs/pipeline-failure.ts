import { ErrorCode } from "@reactify/shared";
import { PermanentJobError, TransientJobError, type JobError } from "./job-errors.js";
import type { ProviderFailureMetadata } from "./provider-failure-metadata.js";

export const RETRYABLE_PIPELINE_FAILURE_CODES = new Set<string>([
  ErrorCode.AI_TIMEOUT,
  ErrorCode.AI_RATE_LIMITED,
  ErrorCode.AI_PROVIDER_UNAVAILABLE,
  ErrorCode.RATE_LIMITED,
  ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
  ErrorCode.GENERATED_PROJECT_MISSING_REQUIRED_FILES,
  ErrorCode.GENERATED_PROJECT_TOKEN_TRUNCATED,
  ErrorCode.PROVIDER_RESPONSE_NOT_JSON,
  ErrorCode.AI_RESPONSE_VERSION_MISSING,
]);

const PERMANENT_AI_FAILURE_CODES = new Set<string>([
  ErrorCode.AI_AUTHENTICATION_FAILED,
  ErrorCode.AI_QUOTA_EXCEEDED,
  ErrorCode.AI_ACCESS_DENIED,
  ErrorCode.AI_MODEL_NOT_AVAILABLE,
  ErrorCode.AI_REQUEST_INVALID,
  ErrorCode.AI_RESPONSE_INVALID,
]);

export function classifyPipelineFailure(
  code: string,
  message: string,
  providerMetadata?: ProviderFailureMetadata,
): JobError {
  if (RETRYABLE_PIPELINE_FAILURE_CODES.has(code)) {
    return new TransientJobError(code, message, providerMetadata);
  }

  if (PERMANENT_AI_FAILURE_CODES.has(code)) {
    return new PermanentJobError(code, message, providerMetadata);
  }

  return new PermanentJobError(code, message, providerMetadata);
}

export function throwPipelineFailure(
  code: string,
  message: string,
  providerMetadata?: ProviderFailureMetadata,
): never {
  throw classifyPipelineFailure(code, message, providerMetadata);
}
