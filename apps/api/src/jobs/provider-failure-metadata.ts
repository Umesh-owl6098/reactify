import type { SafeOpenAIErrorFields } from "../providers/openai-error-utils.js";

export interface ProviderFailureMetadata {
  provider?: string;
  model?: string;
  httpStatus?: number;
  providerErrorType?: string;
  providerErrorCode?: string;
  providerRequestId?: string;
  providerMessage?: string;
  retryable?: boolean;
  validationIssues?: Array<{
    path: string;
    code: string;
    message: string;
  }>;
}

const MAX_PROVIDER_MESSAGE_LENGTH = 500;
const MAX_VALIDATION_ISSUES = 8;

export function toSafeValidationIssues(
  issues: Array<{ path: string; code: string; message: string }> | undefined,
): ProviderFailureMetadata["validationIssues"] {
  if (!issues?.length) {
    return undefined;
  }
  return issues.slice(0, MAX_VALIDATION_ISSUES).map((issue) => ({
    path: issue.path.slice(0, 200),
    code: issue.code.slice(0, 100),
    message: issue.message.slice(0, 500),
  }));
}

export function toProviderFailureMetadata(
  fields: SafeOpenAIErrorFields,
  context?: { provider?: string; model?: string; retryable?: boolean },
): ProviderFailureMetadata | undefined {
  const providerMessage = fields.message.trim().slice(0, MAX_PROVIDER_MESSAGE_LENGTH);
  const metadata: ProviderFailureMetadata = {
    provider: context?.provider?.slice(0, 100),
    model: context?.model?.slice(0, 200),
    httpStatus: fields.httpStatus,
    providerErrorType: fields.errorType,
    providerErrorCode: fields.errorCode,
    providerRequestId: fields.requestId,
    providerMessage: providerMessage || undefined,
    retryable: context?.retryable,
  };

  if (
    metadata.provider === undefined &&
    metadata.model === undefined &&
    metadata.httpStatus === undefined &&
    metadata.providerErrorType === undefined &&
    metadata.providerErrorCode === undefined &&
    metadata.providerRequestId === undefined &&
    metadata.providerMessage === undefined &&
    metadata.retryable === undefined
  ) {
    return undefined;
  }

  return metadata;
}
