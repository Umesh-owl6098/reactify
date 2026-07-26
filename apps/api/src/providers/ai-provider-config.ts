import { ErrorCode } from "@reactify/shared";
import type { Env } from "../env.js";

export function resolveUsageProviderName(env: Env): string {
  if (env.AI_PROVIDER === "mock") {
    return "mock";
  }

  return env.AI_PROVIDER;
}

export function resolveActiveModel(env: Env): string {
  if (env.AI_PROVIDER === "openai") {
    return env.OPENAI_MODEL;
  }

  return env.ANTHROPIC_MODEL;
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
