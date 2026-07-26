import type { SafeOpenAIErrorFields } from "../providers/openai-error-utils.js";

export interface ProviderFailureMetadata {
  httpStatus?: number;
  providerErrorType?: string;
  providerErrorCode?: string;
  providerRequestId?: string;
  providerMessage?: string;
}

const MAX_PROVIDER_MESSAGE_LENGTH = 500;

export function toProviderFailureMetadata(
  fields: SafeOpenAIErrorFields,
): ProviderFailureMetadata | undefined {
  const providerMessage = fields.message.trim().slice(0, MAX_PROVIDER_MESSAGE_LENGTH);
  const metadata: ProviderFailureMetadata = {
    httpStatus: fields.httpStatus,
    providerErrorType: fields.errorType,
    providerErrorCode: fields.errorCode,
    providerRequestId: fields.requestId,
    providerMessage: providerMessage || undefined,
  };

  if (
    metadata.httpStatus === undefined &&
    metadata.providerErrorType === undefined &&
    metadata.providerErrorCode === undefined &&
    metadata.providerRequestId === undefined &&
    metadata.providerMessage === undefined
  ) {
    return undefined;
  }

  return metadata;
}
