import { ErrorCode, type StageResult } from "@reactify/shared";
import { toProviderFailureMetadata } from "../../jobs/provider-failure-metadata.js";
import {
  extractSafeOpenAIErrorFields,
  isRetryableAIProviderError,
} from "../../providers/openai-error-utils.js";
import { isAIProviderError } from "../../providers/provider-errors.js";
import { UsageLimitError } from "../../usage/usage-service.js";

export interface AIStageErrorClassification {
  result: StageResult;
  logFields: Record<string, unknown>;
}

export function classifyAIStageError(
  error: unknown,
  options: {
    generationId: string;
    stage: string;
    provider: string;
    model: string;
    unexpectedMessage: string;
  },
): AIStageErrorClassification {
  const baseLogFields = {
    generationId: options.generationId,
    stage: options.stage,
    provider: options.provider,
    model: options.model,
  };

  if (error instanceof UsageLimitError) {
    return {
      result: {
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
        durationMs: 0,
      },
      logFields: {
        ...baseLogFields,
        failureCode: error.code,
        message: error.message,
        reachedOpenAI: false,
      },
    };
  }

  if (isAIProviderError(error)) {
    const safeFields = extractSafeOpenAIErrorFields(error);
    return {
      result: {
        status: "failed",
        errorCode: error.errorCode,
        errorMessage: error.message,
        providerMetadata: toProviderFailureMetadata(safeFields, {
          provider: options.provider,
          model: options.model,
          retryable: isRetryableAIProviderError(error),
        }),
        durationMs: 0,
      },
      logFields: {
        ...baseLogFields,
        failureCode: error.errorCode,
        ...safeFields,
      },
    };
  }

  return {
    result: {
      status: "failed",
      errorCode: ErrorCode.AI_ERROR,
      errorMessage: options.unexpectedMessage,
      durationMs: 0,
    },
    logFields: {
      ...baseLogFields,
      failureCode: ErrorCode.AI_ERROR,
      message: options.unexpectedMessage,
      reachedOpenAI: false,
    },
  };
}
