import { ErrorCode } from "@reactify/shared";
import { usdToMicros } from "@reactify/shared";
import type { Env } from "../env.js";
import { resolveConfiguredAIModels, resolveUsageProviderName } from "../providers/ai-provider-config.js";
import type { ModelPricing } from "./cost-calculator.js";
import { CostCalculatorError } from "./cost-calculator.js";

export interface PricingRegistry {
  getModelPricing(provider: string, model: string): ModelPricing;
  hasModelPricing(provider: string, model: string): boolean;
  listConfiguredModels(): Array<{ provider: string; model: string }>;
}

export interface PricingRegistryOptions {
  models: Map<string, ModelPricing>;
  fallbackPricing: ModelPricing | null;
  allowFallback: boolean;
}

function pricingKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

export function parsePricingFromEnv(env: NodeJS.ProcessEnv): PricingRegistryOptions {
  const models = new Map<string, ModelPricing>();
  const indexed = new Map<number, { model?: string; provider?: string; input?: number; output?: number }>();

  for (const [key, rawValue] of Object.entries(env)) {
    if (!rawValue?.trim()) {
      continue;
    }

    const indexedMatch = /^AI_PRICING_(\d+)_(MODEL|PROVIDER|INPUT_PER_MILLION_USD|OUTPUT_PER_MILLION_USD)$/.exec(key);
    if (indexedMatch) {
      const index = Number(indexedMatch[1]);
      const field = indexedMatch[2];
      const entry = indexed.get(index) ?? {};
      if (field === "MODEL") {
        entry.model = rawValue.trim();
      } else if (field === "PROVIDER") {
        entry.provider = rawValue.trim();
      } else if (field === "INPUT_PER_MILLION_USD") {
        entry.input = Number(rawValue);
      } else if (field === "OUTPUT_PER_MILLION_USD") {
        entry.output = Number(rawValue);
      }
      indexed.set(index, entry);
      continue;
    }

    if (key === "AI_PRICING_MODEL" || key === "AI_PRICING_ANTHROPIC_MODEL_NAME") {
      const inputUsd = Number(env.AI_PRICING_INPUT_PER_MILLION_USD ?? env.AI_PRICING_INPUT_PER_MILLION);
      const outputUsd = Number(env.AI_PRICING_OUTPUT_PER_MILLION_USD ?? env.AI_PRICING_OUTPUT_PER_MILLION);
      if (Number.isFinite(inputUsd) && Number.isFinite(outputUsd)) {
        models.set(
          pricingKey(env.AI_PROVIDER ?? "anthropic", rawValue.trim()),
          {
            inputPerMillionMicrosUsd: usdToMicros(inputUsd),
            outputPerMillionMicrosUsd: usdToMicros(outputUsd),
          },
        );
      }
    }
  }

  for (const entry of indexed.values()) {
    if (!entry.model || entry.input === undefined || entry.output === undefined) {
      continue;
    }
    const provider = entry.provider ?? "anthropic";
    models.set(pricingKey(provider, entry.model), {
      inputPerMillionMicrosUsd: usdToMicros(entry.input),
      outputPerMillionMicrosUsd: usdToMicros(entry.output),
    });
  }

  const fallbackInput = env.AI_PRICING_FALLBACK_INPUT_PER_MILLION_USD;
  const fallbackOutput = env.AI_PRICING_FALLBACK_OUTPUT_PER_MILLION_USD;
  const fallbackPricing =
    fallbackInput && fallbackOutput
      ? {
          inputPerMillionMicrosUsd: usdToMicros(Number(fallbackInput)),
          outputPerMillionMicrosUsd: usdToMicros(Number(fallbackOutput)),
        }
      : null;

  return {
    models,
    fallbackPricing,
    allowFallback: env.AI_PRICING_ALLOW_FALLBACK === "true",
  };
}

export function createPricingRegistry(env: Env, options: PricingRegistryOptions): PricingRegistry {
  const defaultProvider = resolveUsageProviderName(env);
  const configuredModels = [...new Set(Object.values(resolveConfiguredAIModels(env)))];

  if (env.NODE_ENV === "test" || env.AI_PROVIDER === "mock") {
    for (const model of configuredModels) {
      if (!options.models.has(pricingKey(defaultProvider, model))) {
        options.models.set(pricingKey(defaultProvider, model), {
          inputPerMillionMicrosUsd: usdToMicros(3),
          outputPerMillionMicrosUsd: usdToMicros(15),
        });
      }
      options.models.set(pricingKey("mock", model), {
        inputPerMillionMicrosUsd: usdToMicros(3),
        outputPerMillionMicrosUsd: usdToMicros(15),
      });
    }
    options.models.set(pricingKey("anthropic", env.ANTHROPIC_MODEL), {
      inputPerMillionMicrosUsd: usdToMicros(3),
      outputPerMillionMicrosUsd: usdToMicros(15),
    });
  }

  return {
    getModelPricing(provider: string, model: string): ModelPricing {
      const direct = options.models.get(pricingKey(provider, model));
      if (direct) {
        return direct;
      }

      if (options.allowFallback && options.fallbackPricing) {
        return options.fallbackPricing;
      }

      throw new CostCalculatorError(
        `Pricing is not configured for ${provider}/${model}.`,
        ErrorCode.AI_PRICING_NOT_CONFIGURED,
      );
    },
    hasModelPricing(provider: string, model: string): boolean {
      try {
        this.getModelPricing(provider, model);
        return true;
      } catch {
        return false;
      }
    },
    listConfiguredModels(): Array<{ provider: string; model: string }> {
      return [...options.models.entries()].map(([key]) => {
        const [provider, model] = key.split(":");
        return { provider: provider ?? "unknown", model: model ?? key };
      });
    },
  };
}

export function validatePricingForEnabledProvider(env: Env, registry: PricingRegistry): void {
  const provider = resolveUsageProviderName(env);
  const missingModels = [...new Set(Object.values(resolveConfiguredAIModels(env)))]
    .filter((model) => !registry.hasModelPricing(provider, model));
  if (missingModels.length > 0) {
    console.error(
      `AI pricing is not configured for enabled model(s) ${missingModels.map((model) => `${provider}/${model}`).join(", ")}. ` +
        "Set AI_PRICING_* environment variables or AI_PRICING_ALLOW_FALLBACK=true with fallback rates.",
    );
    if (env.NODE_ENV !== "test") {
      process.exit(1);
    }
  }
}
