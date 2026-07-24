import type {
  AIInput,
  AIInvocationOptions,
  AIInvocationResult,
  AIProvider,
} from "@reactify/shared";
import { designAnalysisFixture } from "./fixtures/index.js";

export interface MockAIProviderOptions {
  rawText?: string;
  error?: Error;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export class MockAIProvider implements AIProvider {
  readonly providerName = "mock";
  readonly defaultModel = "mock-model-v1";

  constructor(private readonly options: MockAIProviderOptions = {}) {}

  async invoke(_inputs: AIInput[], _options: AIInvocationOptions): Promise<AIInvocationResult> {
    if (this.options.error) {
      throw this.options.error;
    }

    return {
      rawText: this.options.rawText ?? JSON.stringify(designAnalysisFixture),
      inputTokens: this.options.inputTokens ?? 100,
      outputTokens: this.options.outputTokens ?? 500,
      latencyMs: this.options.latencyMs ?? 50,
      model: this.defaultModel,
      provider: this.providerName,
    };
  }
}

export function createDesignAnalysisFixtureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...designAnalysisFixture,
    ...overrides,
  });
}
