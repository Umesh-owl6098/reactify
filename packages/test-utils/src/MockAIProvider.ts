import type {
  AIInput,
  AIInvocationOptions,
  AIInvocationResult,
  AIProvider,
} from "@reactify/shared";
import {
  DesignAnalysisV1Schema,
  GeneratedProjectV1Schema,
  GenerationPlanV1Schema,
  ProjectPatchV1Schema,
} from "@reactify/generation-contracts";
import {
  designAnalysisFixture,
  generationPlanFixture,
  generatedProjectFixture,
  projectPatchFixture,
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
    } else {
      rawText = createDefaultMockResponse(inputs);
    }

    return {
      rawText,
      inputTokens: this.options.inputTokens ?? 100,
      outputTokens: this.options.outputTokens ?? 500,
      totalTokens: (this.options.inputTokens ?? 100) + (this.options.outputTokens ?? 500),
      latencyMs: this.options.latencyMs ?? 50,
      model: this.defaultModel,
      provider: this.providerName,
      usageSource: "provider_reported" as const,
    };
  }
}

function createDefaultMockResponse(inputs: AIInput[]): string {
  const prompt = inputs
    .filter((input): input is Extract<AIInput, { text: string }> => "text" in input)
    .map((input) => input.text)
    .join("\n");

  if (prompt.includes("screenshot-to-code pipeline") || prompt.includes("DesignAnalysisV1 structure")) {
    return JSON.stringify(DesignAnalysisV1Schema.parse(designAnalysisFixture));
  }

  if (prompt.includes("frontend architect planning") || prompt.includes("GenerationPlanV1 structure")) {
    return JSON.stringify(GenerationPlanV1Schema.parse(generationPlanFixture));
  }

  if (prompt.includes("repairing a generated React + TypeScript + Tailwind project")) {
    return JSON.stringify(ProjectPatchV1Schema.parse(projectPatchFixture));
  }

  if (prompt.includes("React + TypeScript + Vite + Tailwind") || prompt.includes("GeneratedProjectV1")) {
    return JSON.stringify(GeneratedProjectV1Schema.parse(generatedProjectFixture));
  }

  return JSON.stringify(ProjectPatchV1Schema.parse(projectPatchFixture));
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
