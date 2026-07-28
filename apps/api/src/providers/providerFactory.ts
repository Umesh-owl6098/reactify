import { MockAIProvider } from "@reactify/test-utils";
import type { AIProvider } from "@reactify/shared";
import { ErrorCode } from "@reactify/shared";
import type { Env } from "../env.js";
import {
  aiProviderNotConfiguredError,
  assertAIProviderConfigured,
  resolveOperationAIConfig,
} from "./ai-provider-config.js";
import { createAnthropicProvider } from "./AnthropicProvider.js";
import { createOpenAIProvider } from "./OpenAIProvider.js";
import { AIProviderError } from "./provider-errors.js";

export function createAIProvider(env: Env, override?: AIProvider): AIProvider {
  if (override) {
    return override;
  }

  if (env.AI_PROVIDER === "mock") {
    return new MockAIProvider();
  }

  if (env.NODE_ENV === "test") {
    return new MockAIProvider();
  }

  try {
    assertAIProviderConfigured(env);
  } catch {
    throw new AIProviderError(
      aiProviderNotConfiguredError(env).message,
      ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
    );
  }

  if (env.AI_PROVIDER === "openai") {
    return createOpenAIProvider(
      env.OPENAI_API_KEY!,
      resolveOperationAIConfig(env, "design_analysis").model,
      env.OPENAI_MAX_RETRIES,
    );
  }

  if (env.AI_PROVIDER === "anthropic") {
    return createAnthropicProvider(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL);
  }

  throw new AIProviderError(
    `AI provider is not configured for AI_PROVIDER=${env.AI_PROVIDER}`,
    ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
  );
}
