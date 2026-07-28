import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.js";
import { resolveMockFailureStage } from "./pipeline/mock-failure-stage.js";
import { createAIProvider } from "./providers/providerFactory.js";
import {
  resolveConfiguredAIModels,
  resolveOperationAIConfig,
  resolveUsageProviderName,
} from "./providers/ai-provider-config.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";

const baseEnv = {
  DATABASE_URL: "postgresql://reactify:reactify_dev@localhost:5434/reactify",
  NODE_ENV: "test" as const,
};
const openAIStageEnv = {
  OPENAI_DESIGN_ANALYSIS_MODEL: "gpt-design",
  OPENAI_PLAN_MODEL: "gpt-plan",
  OPENAI_CODE_GENERATION_MODEL: "gpt-code",
  OPENAI_EDIT_MODEL: "gpt-edit",
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

  it("parses explicit false boolean environment values as false", () => {
    const env = validateEnv({
      ...baseEnv,
      AI_PROVIDER: "mock",
      JOB_INLINE_EXECUTION: "false",
      TRUST_PROXY: "false",
      ENABLE_REPAIR: "false",
    });

    expect(env.JOB_INLINE_EXECUTION).toBe(false);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.ENABLE_REPAIR).toBe(false);
  });

  it("parses Railway-style true boolean environment values as true", () => {
    const env = validateEnv({
      ...baseEnv,
      AI_PROVIDER: "mock",
      JOB_INLINE_EXECUTION: "true",
    });

    expect(env.JOB_INLINE_EXECUTION).toBe(true);
  });

  it("loads the same provider mode shape for API and worker env parsing", () => {
    const pricing = {
      AI_PRICING_2_PROVIDER: "openai",
      AI_PRICING_2_MODEL: "gpt-4o",
      AI_PRICING_2_INPUT_PER_MILLION_USD: "2.5",
      AI_PRICING_2_OUTPUT_PER_MILLION_USD: "10",
    };
    const apiEnv = validateEnv({ ...baseEnv, AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", ...openAIStageEnv, ...pricing });
    const workerEnv = validateEnv({ ...baseEnv, AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", ...openAIStageEnv, ...pricing });

    expect(apiEnv.AI_PROVIDER).toBe(workerEnv.AI_PROVIDER);
    expect(resolveConfiguredAIModels(apiEnv)).toEqual(resolveConfiguredAIModels(workerEnv));
    expect(apiEnv.MOCK_AI_FAILURE_STAGE).toBe(workerEnv.MOCK_AI_FAILURE_STAGE);
    expect(resolveUsageProviderName(apiEnv)).toBe("openai");
    expect(resolveOperationAIConfig(apiEnv, "design_analysis").model).toBe("gpt-design");
    expect(resolveOperationAIConfig(apiEnv, "generation_plan_creation").model).toBe("gpt-plan");
    expect(resolveOperationAIConfig(apiEnv, "react_project_generation").model).toBe("gpt-code");
    expect(resolveOperationAIConfig(apiEnv, "automatic_repair").model).toBe("gpt-edit");
  });

  it("worker configuration resolves to OpenAIProvider when openai is selected", () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: "development",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      ...openAIStageEnv,
      OPENAI_DESIGN_ANALYSIS_MODEL: "gpt-4o",
      OPENAI_PLAN_MODEL: "gpt-4o",
      OPENAI_CODE_GENERATION_MODEL: "gpt-4o",
      OPENAI_EDIT_MODEL: "gpt-4o",
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
