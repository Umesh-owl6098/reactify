import { ErrorCode } from "@reactify/shared";

export interface ModelPricing {
  inputPerMillionMicrosUsd: number;
  outputPerMillionMicrosUsd: number;
}

export interface CostBreakdown {
  inputCostMicrosUsd: number;
  outputCostMicrosUsd: number;
  totalCostMicrosUsd: number;
}

const MAX_SAFE_MICROS = Number.MAX_SAFE_INTEGER;
const TOKENS_PER_MILLION = 1_000_000;

export class CostCalculatorError extends Error {
  constructor(
    message: string,
    readonly code: string = ErrorCode.AI_PRICING_NOT_CONFIGURED,
  ) {
    super(message);
    this.name = "CostCalculatorError";
  }
}

function assertNonNegativeInt(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new CostCalculatorError(`${name} must be a non-negative integer.`);
  }
}

function multiplyTokensByRate(tokens: number, ratePerMillionMicros: number): number {
  if (tokens === 0 || ratePerMillionMicros === 0) {
    return 0;
  }

  const numerator = tokens * ratePerMillionMicros;
  if (numerator / tokens !== ratePerMillionMicros) {
    throw new CostCalculatorError("Token cost calculation overflow.");
  }

  const cost = Math.ceil(numerator / TOKENS_PER_MILLION);
  if (cost > MAX_SAFE_MICROS) {
    throw new CostCalculatorError("Token cost calculation overflow.");
  }

  return cost;
}

export function calculateCostMicros(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): CostBreakdown {
  assertNonNegativeInt("inputTokens", inputTokens);
  assertNonNegativeInt("outputTokens", outputTokens);
  assertNonNegativeInt("inputPerMillionMicrosUsd", pricing.inputPerMillionMicrosUsd);
  assertNonNegativeInt("outputPerMillionMicrosUsd", pricing.outputPerMillionMicrosUsd);

  const inputCostMicrosUsd = multiplyTokensByRate(inputTokens, pricing.inputPerMillionMicrosUsd);
  const outputCostMicrosUsd = multiplyTokensByRate(outputTokens, pricing.outputPerMillionMicrosUsd);
  const totalCostMicrosUsd = inputCostMicrosUsd + outputCostMicrosUsd;

  if (totalCostMicrosUsd > MAX_SAFE_MICROS) {
    throw new CostCalculatorError("Total cost calculation overflow.");
  }

  return { inputCostMicrosUsd, outputCostMicrosUsd, totalCostMicrosUsd };
}
