import { MockAIProvider } from "@reactify/test-utils";
import type { AIProvider } from "@reactify/shared";
import type { Env } from "../env.js";
import { createAnthropicProvider } from "./AnthropicProvider.js";

export function createAIProvider(env: Env, override?: AIProvider): AIProvider {
  if (override) {
    return override;
  }

  if (env.AI_PROVIDER === "mock" || env.NODE_ENV === "test") {
    return new MockAIProvider();
  }

  if (env.AI_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic");
    }

    return createAnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }

  throw new Error(`Unsupported AI provider: ${env.AI_PROVIDER}`);
}
