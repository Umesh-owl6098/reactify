import type { AllowedImageMimeType } from "./upload.js";

export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
}

export interface AIJsonSchemaResponseFormat {
  type: "json_schema";
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface AIJsonObjectResponseFormat {
  type: "json_object";
}

export type AIResponseFormat = AIJsonObjectResponseFormat | AIJsonSchemaResponseFormat;

export interface AIInvocationOptions {
  promptVersion: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  timeoutMs: number;
  signal?: AbortSignalLike;
  responseFormat?: AIResponseFormat;
}

export interface AIImageInput {
  base64: string;
  mimeType: AllowedImageMimeType;
}

export interface AITextInput {
  text: string;
}

export type AIInput = AIImageInput | AITextInput;

export interface AIInvocationResult {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  model: string;
  provider: string;
  providerRequestId?: string;
  usageSource?: "provider_reported" | "estimated";
}

export interface AIProvider {
  readonly providerName: string;
  readonly defaultModel: string;
  invoke(inputs: AIInput[], options: AIInvocationOptions): Promise<AIInvocationResult>;
}
