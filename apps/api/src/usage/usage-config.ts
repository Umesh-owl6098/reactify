import { usdToMicros } from "@reactify/shared";
import type { Env } from "../env.js";

export interface UsageConfig {
  defaultMonthlyBudgetMicrosUsd: number | null;
  defaultMonthlyTokenLimit: number | null;
  defaultMaxOperationCostMicrosUsd: number;
  defaultMaxOperationsPerDay: number | null;
  reservationTtlMinutes: number;
  budgetWarningPercent: number;
  costConfirmationThresholdMicrosUsd: number;
}

function parseOptionalUsdMicros(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid USD configuration value: ${raw}`);
  }
  return usdToMicros(value);
}

function parseOptionalInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid integer configuration value: ${raw}`);
  }
  return value;
}

function parseRequiredUsdMicros(raw: string | undefined, fallbackUsd: number): number {
  if (raw === undefined || raw.trim() === "") {
    return usdToMicros(fallbackUsd);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid USD configuration value: ${raw}`);
  }
  return usdToMicros(value);
}

export function createUsageConfig(env: Env): UsageConfig {
  const reservationTtlMinutes = env.AI_USAGE_RESERVATION_TTL_MINUTES;
  const budgetWarningPercent = env.AI_BUDGET_WARNING_PERCENT;

  if (budgetWarningPercent < 0 || budgetWarningPercent > 100) {
    throw new Error("AI_BUDGET_WARNING_PERCENT must be between 0 and 100.");
  }

  if (reservationTtlMinutes < 1 || reservationTtlMinutes > 24 * 60) {
    throw new Error("AI_USAGE_RESERVATION_TTL_MINUTES must be between 1 and 1440.");
  }

  const defaultMonthlyBudgetMicrosUsd = parseOptionalUsdMicros(env.AI_DEFAULT_MONTHLY_BUDGET_USD);
  const defaultMaxOperationCostMicrosUsd = parseRequiredUsdMicros(env.AI_DEFAULT_MAX_OPERATION_COST_USD, 5);
  const defaultMonthlyTokenLimit = parseOptionalInt(env.AI_DEFAULT_MONTHLY_TOKEN_LIMIT);
  const defaultMaxOperationsPerDay = parseOptionalInt(env.AI_DEFAULT_MAX_OPERATIONS_PER_DAY);

  if (
    defaultMonthlyBudgetMicrosUsd !== null &&
    defaultMaxOperationCostMicrosUsd > defaultMonthlyBudgetMicrosUsd
  ) {
    throw new Error("AI_DEFAULT_MAX_OPERATION_COST_USD cannot exceed AI_DEFAULT_MONTHLY_BUDGET_USD.");
  }

  return {
    defaultMonthlyBudgetMicrosUsd,
    defaultMonthlyTokenLimit,
    defaultMaxOperationCostMicrosUsd,
    defaultMaxOperationsPerDay,
    reservationTtlMinutes,
    budgetWarningPercent,
    costConfirmationThresholdMicrosUsd: parseRequiredUsdMicros(env.AI_COST_CONFIRMATION_THRESHOLD_USD, 1),
  };
}
