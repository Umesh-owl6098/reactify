import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.js";
import { resolveMockFailureStage } from "./pipeline/mock-failure-stage.js";
import { createAIProvider } from "./providers/providerFactory.js";
import { resolveActiveModel, resolveUsageProviderName } from "./providers/ai-provider-config.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";

const baseEnv = {
  DATABASE_URL: "postgresql://reactify:reactify_dev@localhost:5434/reactify",
  NODE_ENV: "test" as const,
};

describe("provider mode configuration", () => {
  it("uses mock provider by default in development configuration", () => {
    const env = validateEnv({ ...baseEnv, AI_PROVIDER: "mock" });
    const provider = createAIProvider(env);
    expect(env.AI_PROVIDER).toBe("mock");
    expect(provider.providerName).toBe("mock");
    expect(resolveMockFailureStage(env.MOCK_AI_FAILURE_STAGE)).toBeUndefined();
  });

  it("does not enable forced failure unless MOCK_AI_FAILURE_STAGE is set", () => {
    const withoutFlag = validateEnv({ ...baseEnv, AI_PROVIDER: "mock" });
    const withEmptyFlag = validateEnv({ ...baseEnv, AI_PROVIDER: "mock", MOCK_AI_FAILURE_STAGE: "" });
    const withStage = validateEnv({
      ...baseEnv,
      AI_PROVIDER: "mock",
      MOCK_AI_FAILURE_STAGE: "design_analysis",
    });

    expect(resolveMockFailureStage(withoutFlag.MOCK_AI_FAILURE_STAGE)).toBeUndefined();
    expect(resolveMockFailureStage(withEmptyFlag.MOCK_AI_FAILURE_STAGE)).toBeUndefined();
    expect(resolveMockFailureStage(withStage.MOCK_AI_FAILURE_STAGE)).toBe("design_analysis");
  });

  it("loads the same provider mode shape for API and worker env parsing", () => {
    const pricing = {
      AI_PRICING_2_PROVIDER: "openai",
      AI_PRICING_2_MODEL: "gpt-4o",
      AI_PRICING_2_INPUT_PER_MILLION_USD: "2.5",
      AI_PRICING_2_OUTPUT_PER_MILLION_USD: "10",
    };
    const apiEnv = validateEnv({ ...baseEnv, AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", ...pricing });
    const workerEnv = validateEnv({ ...baseEnv, AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", ...pricing });

    expect(apiEnv.AI_PROVIDER).toBe(workerEnv.AI_PROVIDER);
    expect(apiEnv.OPENAI_MODEL).toBe(workerEnv.OPENAI_MODEL);
    expect(apiEnv.MOCK_AI_FAILURE_STAGE).toBe(workerEnv.MOCK_AI_FAILURE_STAGE);
    expect(resolveUsageProviderName(apiEnv)).toBe("openai");
    expect(resolveActiveModel(apiEnv)).toBe(apiEnv.OPENAI_MODEL);
  });

  it("worker configuration resolves to OpenAIProvider when openai is selected", () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: "development",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-4o",
      AI_PRICING_2_PROVIDER: "openai",
      AI_PRICING_2_MODEL: "gpt-4o",
      AI_PRICING_2_INPUT_PER_MILLION_USD: "2.5",
      AI_PRICING_2_OUTPUT_PER_MILLION_USD: "10",
    });
    const provider = createAIProvider(env);
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.providerName).toBe("openai");
  });
});
