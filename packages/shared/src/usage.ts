import { z } from "zod";

export const UsageOperationTypeSchema = z.enum([
  "design_analysis",
  "generation_plan_creation",
  "react_project_generation",
  "automatic_repair",
  "edit_intent_analysis",
  "project_edit_generation",
  "visual_correction",
]);

export const UsageOperationStatusSchema = z.enum([
  "reserved",
  "completed",
  "failed",
  "cancelled",
  "reconciled",
]);

export const UsageSummarySchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  actualCostUsd: z.number().nonnegative(),
  operationCount: z.number().int().nonnegative(),
  failedOperationCount: z.number().int().nonnegative(),
  remainingBudgetUsd: z.number().nonnegative().nullable(),
  remainingTokenAllowance: z.number().int().nonnegative().nullable(),
});

export const UsageOperationSummarySchema = z.object({
  usageId: z.string().uuid(),
  generationId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  operationType: UsageOperationTypeSchema,
  provider: z.string(),
  model: z.string(),
  status: UsageOperationStatusSchema,
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
  actualInputTokens: z.number().int().nonnegative().optional(),
  actualOutputTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative(),
  actualCostUsd: z.number().nonnegative().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const UsageLimitStatusSchema = z.object({
  allowed: z.boolean(),
  blockedReason: z.string().optional(),
  monthlyBudgetUsd: z.number().nonnegative().nullable(),
  usedBudgetUsd: z.number().nonnegative(),
  reservedBudgetUsd: z.number().nonnegative(),
  remainingBudgetUsd: z.number().nonnegative().nullable(),
  monthlyTokenLimit: z.number().int().nonnegative().nullable(),
  usedTokens: z.number().int().nonnegative(),
  reservedTokens: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative().nullable(),
  nextResetAt: z.string().datetime(),
  warningMessage: z.string().optional(),
});

export const UsageAccountResponseSchema = z.object({
  summary: UsageSummarySchema,
  limits: UsageLimitStatusSchema,
});

export const UsageOperationListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  items: z.array(UsageOperationSummarySchema),
});

export const GenerationUsageResponseSchema = z.object({
  generationId: z.string().uuid(),
  summary: UsageSummarySchema,
  operations: z.array(UsageOperationSummarySchema),
});

export type UsageAccountResponse = z.infer<typeof UsageAccountResponseSchema>;
export type UsageOperationListResponse = z.infer<typeof UsageOperationListResponseSchema>;
export type GenerationUsageResponse = z.infer<typeof GenerationUsageResponseSchema>;

export const AiEstimateRequestSchema = z.object({
  operationType: UsageOperationTypeSchema,
  instruction: z.string().optional(),
  selectedFiles: z.array(z.string()).optional(),
  selectedComponentIds: z.array(z.string()).optional(),
  expectedProjectHash: z.string().optional(),
});

export const AiEstimateResponseSchema = z.object({
  operationType: UsageOperationTypeSchema,
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  allowed: z.boolean(),
  blockedReason: z.string().optional(),
  remainingBudgetUsd: z.number().nonnegative().nullable().optional(),
  remainingTokens: z.number().int().nonnegative().nullable().optional(),
  warningMessage: z.string().optional(),
});

export const MICROS_PER_USD = 1_000_000;

export type UsageOperationType = z.infer<typeof UsageOperationTypeSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
export type UsageOperationSummary = z.infer<typeof UsageOperationSummarySchema>;
export type UsageLimitStatus = z.infer<typeof UsageLimitStatusSchema>;
export type AiEstimateRequest = z.infer<typeof AiEstimateRequestSchema>;
export type AiEstimateResponse = z.infer<typeof AiEstimateResponseSchema>;

export function microsToUsd(micros: number): number {
  return micros / MICROS_PER_USD;
}

export function usdToMicros(usd: number): number {
  return Math.ceil(usd * MICROS_PER_USD);
}
