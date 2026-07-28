import { ErrorCode, type AIStageConfig, type UsageOperationType } from "@reactify/shared";
import type { Env } from "../env.js";

export type AIConfigOperation = UsageOperationType;

function requireOpenAIModel(value: string | undefined, variableName: string): string {
  if (!value?.trim()) {
    throw new Error(`${variableName} is required when AI_PROVIDER=openai`);
  }
  return value.trim();
}

function resolveOpenAIStageConfig(
  env: Env,
  operation: AIConfigOperation,
): Pick<AIStageConfig, "model" | "maxTokens"> {
  switch (operation) {
    case "design_analysis":
      return {
        model: requireOpenAIModel(env.OPENAI_DESIGN_ANALYSIS_MODEL, "OPENAI_DESIGN_ANALYSIS_MODEL"),
        maxTokens: env.OPENAI_DESIGN_ANALYSIS_MAX_OUTPUT_TOKENS,
      };
    case "generation_plan_creation":
      return {
        model: requireOpenAIModel(env.OPENAI_PLAN_MODEL, "OPENAI_PLAN_MODEL"),
        maxTokens: env.OPENAI_PLAN_MAX_OUTPUT_TOKENS,
      };
    case "react_project_generation":
      return {
        model: requireOpenAIModel(env.OPENAI_CODE_GENERATION_MODEL, "OPENAI_CODE_GENERATION_MODEL"),
        maxTokens: env.OPENAI_CODE_GENERATION_MAX_OUTPUT_TOKENS,
      };
    case "automatic_repair":
    case "edit_intent_analysis":
    case "project_edit_generation":
    case "visual_correction":
      return {
        model: requireOpenAIModel(env.OPENAI_EDIT_MODEL, "OPENAI_EDIT_MODEL"),
        maxTokens: env.OPENAI_EDIT_MAX_OUTPUT_TOKENS,
      };
  }
}

export function resolveOperationAIConfig(env: Env, operation: AIConfigOperation): AIStageConfig {
  const stage =
    env.AI_PROVIDER === "openai"
      ? resolveOpenAIStageConfig(env, operation)
      : { model: env.ANTHROPIC_MODEL, maxTokens: env.AI_MAX_TOKENS };
  return {
    ...stage,
    temperature: env.AI_TEMPERATURE,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}

export function resolveConfiguredAIModels(env: Env): Record<"design" | "plan" | "code" | "edit", string> {
  return {
    design: resolveOperationAIConfig(env, "design_analysis").model,
    plan: resolveOperationAIConfig(env, "generation_plan_creation").model,
    code: resolveOperationAIConfig(env, "react_project_generation").model,
    edit: resolveOperationAIConfig(env, "project_edit_generation").model,
  };
}

export function resolveUsageProviderName(env: Env): string {
  if (env.AI_PROVIDER === "mock") {
    return "mock";
  }

  return env.AI_PROVIDER;
}

export function isAIProviderConfigured(env: Env): boolean {
  if (env.AI_PROVIDER === "mock") {
    return true;
  }

  if (env.AI_PROVIDER === "openai") {
    return Boolean(env.OPENAI_API_KEY?.trim());
  }

  if (env.AI_PROVIDER === "anthropic") {
    return Boolean(env.ANTHROPIC_API_KEY?.trim());
  }

  return false;
}

export function missingAIProviderConfigurationMessage(env: Env): string {
  if (env.AI_PROVIDER === "openai") {
    return "OPENAI_API_KEY is required when AI_PROVIDER=openai";
  }

  if (env.AI_PROVIDER === "anthropic") {
    return "ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic";
  }

  return `AI provider is not configured for AI_PROVIDER=${env.AI_PROVIDER}`;
}

export function assertAIProviderConfigured(env: Env): void {
  if (!isAIProviderConfigured(env)) {
    throw new Error(missingAIProviderConfigurationMessage(env));
  }
}

export function aiProviderNotConfiguredError(env: Env): Error {
  return Object.assign(new Error(missingAIProviderConfigurationMessage(env)), {
    code: ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
  });
}
