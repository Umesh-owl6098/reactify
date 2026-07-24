import type {
  AIInput,
  AIInvocationOptions,
  AIInvocationResult,
  AIProvider,
} from "@reactify/shared";
import {
  designAnalysisFixture,
  generationPlanFixture,
  generatedProjectFixture,
} from "./fixtures/index.js";

export interface MockAIProviderOptions {
  rawText?: string;
  responses?: string[];
  error?: Error;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export class MockAIProvider implements AIProvider {
  readonly providerName = "mock";
  readonly defaultModel = "mock-model-v1";
  private callCount = 0;
  readonly invocations: Array<{ inputs: AIInput[]; options: AIInvocationOptions }> = [];

  constructor(private readonly options: MockAIProviderOptions = {}) {}

  async invoke(inputs: AIInput[], options: AIInvocationOptions): Promise<AIInvocationResult> {
    this.invocations.push({ inputs, options });

    if (this.options.error) {
      throw this.options.error;
    }

    let rawText: string;
    if (this.options.responses) {
      rawText = this.options.responses[this.callCount] ?? JSON.stringify(generationPlanFixture);
      this.callCount += 1;
    } else if (this.options.rawText) {
      rawText = this.options.rawText;
    } else if (this.callCount === 0) {
      rawText = JSON.stringify(designAnalysisFixture);
      this.callCount += 1;
    } else if (this.callCount === 1) {
      rawText = JSON.stringify(generationPlanFixture);
      this.callCount += 1;
    } else {
      rawText = JSON.stringify(generatedProjectFixture);
      this.callCount += 1;
    }

    return {
      rawText,
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

export function createGenerationPlanFixtureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...generationPlanFixture,
    ...overrides,
  });
}

export function createGeneratedProjectFixtureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...generatedProjectFixture,
    ...overrides,
  });
}
