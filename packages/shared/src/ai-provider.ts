import type { AllowedImageMimeType } from "./upload.js";

export interface AIInvocationOptions {
  promptVersion: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  timeoutMs: number;
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
