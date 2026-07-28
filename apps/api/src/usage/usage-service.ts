import { ErrorCode, microsToUsd, type UsageLimitStatus, type UsageOperationType, type UsageSummary } from "@reactify/shared";
import type { Env } from "../env.js";
import { calculateCostMicros } from "./cost-calculator.js";
import { createPricingRegistry, parsePricingFromEnv, type PricingRegistry } from "./pricing-registry.js";
import { estimateTokens, type TokenEstimateInput } from "./token-estimator.js";
import { createUsageConfig, type UsageConfig } from "./usage-config.js";
import { getCurrentUsagePeriod } from "./usage-period.js";
import {
  createRequestFingerprint,
  UsageRepository,
  type EffectiveUsagePolicy,
} from "./usage-repository.js";

export class UsageLimitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UsageLimitError";
  }
}

export interface ReserveUsageParams {
  ownerId: string;
  generationId: string;
  jobId: string;
  operationType: UsageOperationType;
  attemptNumber: number;
  provider: string;
  model: string;
  estimate: TokenEstimateInput;
}

export interface ReserveUsageResult {
  reservationId: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostMicrosUsd: number;
  warningMessage?: string;
}

export interface ReconcileProviderUsageParams {
  reservationId: string;
  ownerId: string;
  generationId: string;
  jobId: string;
  operationType: UsageOperationType;
  attemptNumber: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  providerRequestId?: string;
  usageSource: "provider_reported" | "estimated";
  failureCode?: string;
  requestFingerprint?: string;
}

function bigintToNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "bigint" ? Number(value) : value;
}

export class UsageService {
  readonly config: UsageConfig;
  readonly pricing: PricingRegistry;
  readonly repository: UsageRepository;

  constructor(
    private readonly env: Env,
    repository: UsageRepository,
    config?: UsageConfig,
    pricing?: PricingRegistry,
  ) {
    this.repository = repository;
    this.config = config ?? createUsageConfig(env);
    this.pricing =
      pricing ?? createPricingRegistry(env, parsePricingFromEnv(process.env));
  }

  getDefaultPolicy(): EffectiveUsagePolicy {
    return {
      monthlyBudgetMicrosUsd: this.config.defaultMonthlyBudgetMicrosUsd,
      monthlyTokenLimit: this.config.defaultMonthlyTokenLimit,
      perOperationCostLimitMicrosUsd: this.config.defaultMaxOperationCostMicrosUsd,
      maxAiOperationsPerDay: this.config.defaultMaxOperationsPerDay,
    };
  }

  estimateOperation(params: TokenEstimateInput & { provider: string; model: string }) {
    const tokens = estimateTokens(params);
    const pricing = this.pricing.getModelPricing(params.provider, params.model);
    const cost = calculateCostMicros(tokens.estimatedInputTokens, tokens.estimatedOutputTokens, pricing);
    return { ...tokens, estimatedCostMicrosUsd: cost.totalCostMicrosUsd };
  }

  async checkLimits(params: {
    ownerId: string;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCostMicrosUsd: number;
  }): Promise<UsageLimitStatus> {
    const policy = await this.repository.getEffectivePolicy(params.ownerId, this.getDefaultPolicy());
    return this.buildLimitStatus(
      params.ownerId,
      policy,
      params.estimatedInputTokens,
      params.estimatedOutputTokens,
      params.estimatedCostMicrosUsd,
    );
  }

  private async buildLimitStatus(
    ownerId: string,
    policy: EffectiveUsagePolicy,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
    estimatedCostMicrosUsd: number,
  ): Promise<UsageLimitStatus> {
    const aggregate = await this.repository.getOrCreateAggregate(ownerId);
    const { periodEnd } = getCurrentUsagePeriod();

    const usedBudgetUsd = microsToUsd(bigintToNumber(aggregate.completedCostMicrosUsd));
    const reservedBudgetUsd = microsToUsd(bigintToNumber(aggregate.reservedCostMicrosUsd));
    const usedTokens = aggregate.completedInputTokens + aggregate.completedOutputTokens;
    const reservedTokens = aggregate.reservedTokens;

    const monthlyBudgetMicros = policy.monthlyBudgetMicrosUsd;
    const monthlyTokenLimit = policy.monthlyTokenLimit;

    const remainingBudgetMicros =
      monthlyBudgetMicros === null
        ? null
        : Math.max(0, monthlyBudgetMicros - bigintToNumber(aggregate.completedCostMicrosUsd) - bigintToNumber(aggregate.reservedCostMicrosUsd));

    const remainingTokens =
      monthlyTokenLimit === null ? null : Math.max(0, monthlyTokenLimit - usedTokens - reservedTokens);

    let allowed = true;
    let blockedReason: string | undefined;
    let warningMessage: string | undefined;

    if (estimatedCostMicrosUsd > policy.perOperationCostLimitMicrosUsd) {
      allowed = false;
      blockedReason = "This operation exceeds the allowed per-operation cost.";
    }

    if (monthlyBudgetMicros !== null && estimatedCostMicrosUsd > (remainingBudgetMicros ?? 0)) {
      allowed = false;
      blockedReason = "Monthly AI budget reached.";
    }

    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
    if (monthlyTokenLimit !== null && estimatedTotalTokens > (remainingTokens ?? 0)) {
      allowed = false;
      blockedReason = "Monthly token limit reached.";
    }

    if (policy.maxAiOperationsPerDay !== null) {
      const dayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
      const dailyCount =
        aggregate.dailyOperationDate?.getTime() === dayStart.getTime() ? aggregate.dailyOperationCount : 0;
      if (dailyCount >= policy.maxAiOperationsPerDay) {
        allowed = false;
        blockedReason = "Daily AI operation limit reached.";
      }
    }

    if (allowed && monthlyBudgetMicros !== null) {
      const usedPercent =
        ((bigintToNumber(aggregate.completedCostMicrosUsd) + bigintToNumber(aggregate.reservedCostMicrosUsd)) /
          monthlyBudgetMicros) *
        100;
      if (usedPercent >= this.config.budgetWarningPercent) {
        warningMessage = `You have used ${Math.floor(usedPercent)}% of your monthly AI budget.`;
      }
      if (
        remainingBudgetMicros !== null &&
        estimatedCostMicrosUsd >= remainingBudgetMicros * 0.8
      ) {
        warningMessage =
          warningMessage ??
          "This operation may use most of your remaining monthly allowance.";
      }
    }

    return {
      allowed,
      blockedReason,
      monthlyBudgetUsd: monthlyBudgetMicros === null ? null : microsToUsd(monthlyBudgetMicros),
      usedBudgetUsd,
      reservedBudgetUsd,
      remainingBudgetUsd: remainingBudgetMicros === null ? null : microsToUsd(remainingBudgetMicros),
      monthlyTokenLimit,
      usedTokens,
      reservedTokens,
      remainingTokens,
      nextResetAt: periodEnd.toISOString(),
      warningMessage,
    };
  }

  async reserveForJob(params: ReserveUsageParams): Promise<ReserveUsageResult> {
    const estimate = this.estimateOperation({
      ...params.estimate,
      operationType: params.operationType,
      provider: params.provider,
      model: params.model,
    });

    const policy = await this.repository.getEffectivePolicy(params.ownerId, this.getDefaultPolicy());
    const limits = await this.buildLimitStatus(
      params.ownerId,
      policy,
      estimate.estimatedInputTokens,
      estimate.estimatedOutputTokens,
      estimate.estimatedCostMicrosUsd,
    );

    if (!limits.allowed) {
      throw new UsageLimitError(
        this.mapBlockedReasonToCode(limits.blockedReason),
        limits.blockedReason ?? "Usage limit exceeded.",
      );
    }

    const expiresAt = new Date(Date.now() + this.config.reservationTtlMinutes * 60_000);
    const reservedTokens = estimate.estimatedInputTokens + estimate.estimatedOutputTokens;

    try {
      const reservation = await this.repository.prisma.$transaction(async (tx) => {
        const aggregate = await this.repository.lockAggregate(params.ownerId, tx);
        const freshLimits = await this.buildLimitStatus(
          params.ownerId,
          policy,
          estimate.estimatedInputTokens,
          estimate.estimatedOutputTokens,
          estimate.estimatedCostMicrosUsd,
        );
        if (!freshLimits.allowed) {
          throw new UsageLimitError(
            this.mapBlockedReasonToCode(freshLimits.blockedReason),
            freshLimits.blockedReason ?? "Usage limit exceeded.",
          );
        }

        const created = await this.repository.createReservation(tx, {
          ownerId: params.ownerId,
          jobId: params.jobId,
          operationType: params.operationType,
          reservedInputTokens: estimate.estimatedInputTokens,
          reservedOutputTokens: estimate.estimatedOutputTokens,
          reservedCostMicrosUsd: estimate.estimatedCostMicrosUsd,
          attemptNumber: params.attemptNumber,
          expiresAt,
        });

        await this.repository.incrementAggregateReservation(
          tx,
          aggregate.id,
          reservedTokens,
          estimate.estimatedCostMicrosUsd,
          true,
        );

        return created;
      });

      return {
        reservationId: reservation.id,
        estimatedInputTokens: estimate.estimatedInputTokens,
        estimatedOutputTokens: estimate.estimatedOutputTokens,
        estimatedCostMicrosUsd: estimate.estimatedCostMicrosUsd,
        warningMessage: limits.warningMessage,
      };
    } catch (error) {
      if (error instanceof UsageLimitError) {
        throw error;
      }
      throw new UsageLimitError(ErrorCode.AI_USAGE_RESERVATION_FAILED, "Failed to reserve AI usage allowance.");
    }
  }

  async releaseReservationForJob(jobId: string, attemptNumber: number): Promise<void> {
    const reservation = await this.repository.getActiveReservationForJob(jobId, attemptNumber);
    if (reservation) {
      await this.repository.releaseReservation(reservation.id);
    }
  }

  async ensureInvocationReservation(params: {
    reservationId: string;
    ownerId: string;
    generationId: string;
    jobId: string;
    operationType: UsageOperationType;
    attemptNumber: number;
    provider: string;
    model: string;
    maxOutputTokens: number;
  }): Promise<string> {
    const current = await this.repository.prisma.usageReservation.findUnique({
      where: { id: params.reservationId },
    });

    if (current?.status === "active") {
      await this.verifyReservation(params);
      return current.id;
    }

    const next = await this.reserveForJob({
      ownerId: params.ownerId,
      generationId: params.generationId,
      jobId: params.jobId,
      operationType: params.operationType,
      attemptNumber: params.attemptNumber,
      provider: params.provider,
      model: params.model,
      estimate: {
        operationType: params.operationType,
        maxOutputTokens: params.maxOutputTokens,
      },
    });

    return next.reservationId;
  }

  async verifyReservation(params: {
    reservationId: string;
    ownerId: string;
    jobId: string;
    attemptNumber: number;
  }): Promise<void> {
    const reservation = await this.repository.prisma.usageReservation.findUnique({
      where: { id: params.reservationId },
    });
    if (!reservation || reservation.status !== "active") {
      throw new UsageLimitError(ErrorCode.AI_USAGE_RESERVATION_FAILED, "Usage reservation is not active.");
    }
    if (reservation.ownerId !== params.ownerId || reservation.jobId !== params.jobId) {
      throw new UsageLimitError(ErrorCode.AI_USAGE_RESERVATION_FAILED, "Usage reservation ownership mismatch.");
    }
    if (reservation.attemptNumber !== params.attemptNumber) {
      throw new UsageLimitError(ErrorCode.AI_USAGE_RESERVATION_FAILED, "Usage reservation attempt mismatch.");
    }
    if (reservation.expiresAt.getTime() <= Date.now()) {
      throw new UsageLimitError(ErrorCode.AI_USAGE_RESERVATION_EXPIRED, "Usage reservation expired.");
    }
  }

  async reconcileProviderUsage(params: ReconcileProviderUsageParams): Promise<void> {
    const pricing = this.pricing.getModelPricing(params.provider, params.model);
    const cost = calculateCostMicros(params.inputTokens, params.outputTokens, pricing);
    const { periodStart, periodEnd } = getCurrentUsagePeriod();

    const result = await this.repository.reconcileReservation({
      reservationId: params.reservationId,
      actualInputTokens: params.inputTokens,
      actualOutputTokens: params.outputTokens,
      actualCostMicrosUsd: cost.totalCostMicrosUsd,
      usageRecord: {
        owner: { connect: { id: params.ownerId } },
        generation: { connect: { id: params.generationId } },
        jobId: params.jobId,
        operationType: params.operationType,
        provider: params.provider,
        model: params.model,
        status: "reconciled",
        attemptNumber: params.attemptNumber,
        actualInputTokens: params.inputTokens,
        actualOutputTokens: params.outputTokens,
        actualCostMicrosUsd: BigInt(cost.totalCostMicrosUsd),
        providerRequestId: params.providerRequestId,
        usageSource: params.usageSource,
        failureCode: params.failureCode,
        requestFingerprint:
          params.requestFingerprint ??
          createRequestFingerprint(params.jobId, params.attemptNumber),
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
      },
    });

    if (!result.usageRecord) {
      throw new UsageLimitError(ErrorCode.AI_USAGE_RECONCILIATION_FAILED, "Usage reconciliation failed.");
    }
  }

  async getAccountUsage(ownerId: string): Promise<{ summary: UsageSummary; limits: UsageLimitStatus }> {
    const aggregate = await this.repository.getOrCreateAggregate(ownerId);
    const policy = await this.repository.getEffectivePolicy(ownerId, this.getDefaultPolicy());
    const { periodStart, periodEnd } = getCurrentUsagePeriod();
    const limits = await this.buildLimitStatus(ownerId, policy, 0, 0, 0);

    const completedCost = bigintToNumber(aggregate.completedCostMicrosUsd);
    const reservedCost = bigintToNumber(aggregate.reservedCostMicrosUsd);

    return {
      summary: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        inputTokens: aggregate.completedInputTokens,
        outputTokens: aggregate.completedOutputTokens,
        totalTokens: aggregate.completedInputTokens + aggregate.completedOutputTokens,
        estimatedCostUsd: microsToUsd(completedCost + reservedCost),
        actualCostUsd: microsToUsd(completedCost),
        operationCount: aggregate.operationCount,
        failedOperationCount: aggregate.failedOperationCount,
        remainingBudgetUsd: limits.remainingBudgetUsd,
        remainingTokenAllowance: limits.remainingTokens,
      },
      limits,
    };
  }

  mapBlockedReasonToCode(reason?: string): string {
    switch (reason) {
      case "Monthly AI budget reached.":
        return ErrorCode.AI_MONTHLY_BUDGET_EXCEEDED;
      case "Monthly token limit reached.":
        return ErrorCode.AI_TOKEN_LIMIT_EXCEEDED;
      case "This operation exceeds the allowed per-operation cost.":
        return ErrorCode.AI_OPERATION_COST_LIMIT_EXCEEDED;
      case "Daily AI operation limit reached.":
        return ErrorCode.AI_DAILY_OPERATION_LIMIT_EXCEEDED;
      default:
        return ErrorCode.AI_USAGE_RESERVATION_FAILED;
    }
  }

  isMeteredJobType(jobType: string): jobType is UsageOperationType {
    return [
      "design_analysis",
      "generation_plan_creation",
      "react_project_generation",
      "automatic_repair",
      "edit_intent_analysis",
      "project_edit_generation",
      "visual_correction",
    ].includes(jobType);
  }
}

export function createUsageService(env: Env, repository: UsageRepository): UsageService {
  return new UsageService(env, repository);
}
