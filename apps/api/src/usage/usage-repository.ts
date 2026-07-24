import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { UsageOperationType } from "@reactify/shared";
import { getCurrentUsagePeriod, getUtcDayStart } from "./usage-period.js";

export type ReservationStatus = "active" | "reconciled" | "released" | "expired";

export interface EffectiveUsagePolicy {
  monthlyBudgetMicrosUsd: number | null;
  monthlyTokenLimit: number | null;
  perOperationCostLimitMicrosUsd: number;
  maxAiOperationsPerDay: number | null;
}

function bigintToNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "bigint" ? Number(value) : value;
}

export class UsageRepository {
  constructor(readonly prisma: PrismaClient) {}

  async getEffectivePolicy(ownerId: string, defaults: EffectiveUsagePolicy): Promise<EffectiveUsagePolicy> {
    const policy = await this.prisma.userUsagePolicy.findUnique({ where: { userId: ownerId } });
    if (!policy) {
      return defaults;
    }

    return {
      monthlyBudgetMicrosUsd:
        policy.monthlyBudgetMicrosUsd === null ? null : bigintToNumber(policy.monthlyBudgetMicrosUsd),
      monthlyTokenLimit: policy.monthlyTokenLimit,
      perOperationCostLimitMicrosUsd:
        policy.perOperationCostLimitMicrosUsd === null
          ? defaults.perOperationCostLimitMicrosUsd
          : bigintToNumber(policy.perOperationCostLimitMicrosUsd),
      maxAiOperationsPerDay: policy.maxAiOperationsPerDay ?? defaults.maxAiOperationsPerDay,
    };
  }

  async getOrCreateAggregate(ownerId: string, tx: Prisma.TransactionClient = this.prisma) {
    const { periodStart, periodEnd } = getCurrentUsagePeriod();
    const existing = await tx.usagePeriodAggregate.findUnique({
      where: { ownerId_periodStart: { ownerId, periodStart } },
    });
    if (existing) {
      return existing;
    }

    return tx.usagePeriodAggregate.create({
      data: {
        ownerId,
        periodStart,
        periodEnd,
      },
    });
  }

  async lockAggregate(ownerId: string, tx: Prisma.TransactionClient) {
    const { periodStart } = getCurrentUsagePeriod();
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "UsagePeriodAggregate"
      WHERE "ownerId" = ${ownerId}::uuid AND "periodStart" = ${periodStart}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      await this.getOrCreateAggregate(ownerId, tx);
      await tx.$queryRaw`
        SELECT id FROM "UsagePeriodAggregate"
        WHERE "ownerId" = ${ownerId}::uuid AND "periodStart" = ${periodStart}
        FOR UPDATE
      `;
    }

    return this.getOrCreateAggregate(ownerId, tx);
  }

  async createReservation(
    tx: Prisma.TransactionClient,
    data: {
      ownerId: string;
      jobId: string;
      operationType: UsageOperationType;
      reservedInputTokens: number;
      reservedOutputTokens: number;
      reservedCostMicrosUsd: number;
      attemptNumber: number;
      expiresAt: Date;
    },
  ) {
    return tx.usageReservation.create({
      data: {
        ownerId: data.ownerId,
        jobId: data.jobId,
        operationType: data.operationType,
        reservedInputTokens: data.reservedInputTokens,
        reservedOutputTokens: data.reservedOutputTokens,
        reservedCostMicrosUsd: BigInt(data.reservedCostMicrosUsd),
        status: "active",
        attemptNumber: data.attemptNumber,
        expiresAt: data.expiresAt,
      },
    });
  }

  async incrementAggregateReservation(
    tx: Prisma.TransactionClient,
    aggregateId: string,
    reservedTokens: number,
    reservedCostMicrosUsd: number,
    incrementDailyCount: boolean,
  ) {
    const dayStart = getUtcDayStart();
    const aggregate = await tx.usagePeriodAggregate.findUniqueOrThrow({ where: { id: aggregateId } });
    const resetDaily =
      !aggregate.dailyOperationDate ||
      aggregate.dailyOperationDate.getTime() !== dayStart.getTime();

    await tx.usagePeriodAggregate.update({
      where: { id: aggregateId },
      data: {
        reservedTokens: { increment: reservedTokens },
        reservedCostMicrosUsd: { increment: BigInt(reservedCostMicrosUsd) },
        dailyOperationCount: incrementDailyCount
          ? resetDaily
            ? 1
            : { increment: 1 }
          : undefined,
        dailyOperationDate: incrementDailyCount ? dayStart : undefined,
      },
    });
  }

  async getActiveReservationForJob(jobId: string, attemptNumber: number) {
    return this.prisma.usageReservation.findFirst({
      where: { jobId, attemptNumber, status: "active" },
      orderBy: { createdAt: "desc" },
    });
  }

  async releaseReservation(reservationId: string, status: ReservationStatus = "released") {
    const reservation = await this.prisma.usageReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.status !== "active") {
      return reservation;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.usageReservation.update({
        where: { id: reservationId },
        data: { status, releasedAt: new Date() },
      });

      const aggregate = await this.lockAggregate(reservation.ownerId, tx);
      await tx.usagePeriodAggregate.update({
        where: { id: aggregate.id },
        data: {
          reservedTokens: {
            decrement: reservation.reservedInputTokens + reservation.reservedOutputTokens,
          },
          reservedCostMicrosUsd: {
            decrement: reservation.reservedCostMicrosUsd,
          },
        },
      });

      return updated;
    });
  }

  async reconcileReservation(params: {
    reservationId: string;
    actualInputTokens: number;
    actualOutputTokens: number;
    actualCostMicrosUsd: number;
    usageRecord: Prisma.AiUsageRecordCreateInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.usageReservation.findUniqueOrThrow({ where: { id: params.reservationId } });
      if (reservation.status !== "active") {
        return { reservation, usageRecord: null };
      }

      const aggregate = await this.lockAggregate(reservation.ownerId, tx);
      const requestFingerprint =
        params.usageRecord.requestFingerprint ??
        createRequestFingerprint(reservation.jobId ?? reservation.id, reservation.attemptNumber);

      let usageRecord;
      try {
        usageRecord = await tx.aiUsageRecord.create({
          data: {
            ...params.usageRecord,
            requestFingerprint,
            estimatedInputTokens: reservation.reservedInputTokens,
            estimatedOutputTokens: reservation.reservedOutputTokens,
            estimatedCostMicrosUsd: reservation.reservedCostMicrosUsd,
            actualInputTokens: params.actualInputTokens,
            actualOutputTokens: params.actualOutputTokens,
            actualCostMicrosUsd: BigInt(params.actualCostMicrosUsd),
            status: "reconciled",
            completedAt: new Date(),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          usageRecord = await tx.aiUsageRecord.findFirst({
            where: {
              jobId: reservation.jobId,
              attemptNumber: reservation.attemptNumber,
              requestFingerprint,
            },
          });
        } else {
          throw error;
        }
      }

      await tx.usageReservation.update({
        where: { id: reservation.id },
        data: { status: "reconciled", reconciledAt: new Date() },
      });

      const reservedTokens = reservation.reservedInputTokens + reservation.reservedOutputTokens;

      await tx.usagePeriodAggregate.update({
        where: { id: aggregate.id },
        data: {
          reservedTokens: { decrement: reservedTokens },
          reservedCostMicrosUsd: { decrement: reservation.reservedCostMicrosUsd },
          completedInputTokens: { increment: params.actualInputTokens },
          completedOutputTokens: { increment: params.actualOutputTokens },
          completedCostMicrosUsd: { increment: BigInt(params.actualCostMicrosUsd) },
          operationCount: { increment: 1 },
        },
      });

      return { reservation, usageRecord };
    });
  }

  async markUsageFailed(params: {
    reservationId: string;
    failureCode: string;
    usageRecord: Omit<Prisma.AiUsageRecordCreateInput, "status" | "completedAt">;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.usageReservation.findUniqueOrThrow({ where: { id: params.reservationId } });
      const aggregate = await this.lockAggregate(reservation.ownerId, tx);

      const usageRecord = await tx.aiUsageRecord.create({
        data: {
          ...params.usageRecord,
          status: "failed",
          failureCode: params.failureCode,
          completedAt: new Date(),
        },
      });

      if (reservation.status === "active") {
        await tx.usageReservation.update({
          where: { id: reservation.id },
          data: { status: "released", releasedAt: new Date() },
        });
        await tx.usagePeriodAggregate.update({
          where: { id: aggregate.id },
          data: {
            reservedTokens: {
              decrement: reservation.reservedInputTokens + reservation.reservedOutputTokens,
            },
            reservedCostMicrosUsd: { decrement: reservation.reservedCostMicrosUsd },
            failedOperationCount: { increment: 1 },
          },
        });
      }

      return usageRecord;
    });
  }

  async listOperations(query: {
    ownerId: string;
    generationId?: string;
    operationType?: string;
    status?: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
    order: "asc" | "desc";
  }) {
    const where: Prisma.AiUsageRecordWhereInput = {
      ownerId: query.ownerId,
      ...(query.generationId ? { generationId: query.generationId } : {}),
      ...(query.operationType ? { operationType: query.operationType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.aiUsageRecord.count({ where }),
      this.prisma.aiUsageRecord.findMany({
        where,
        orderBy: { createdAt: query.order },
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    return { total, items };
  }

  async rebuildAggregate(ownerId: string) {
    const { periodStart, periodEnd } = getCurrentUsagePeriod();
    const completed = await this.prisma.aiUsageRecord.findMany({
      where: {
        ownerId,
        billingPeriodStart: periodStart,
        status: { in: ["reconciled", "completed"] },
      },
    });
    const activeReservations = await this.prisma.usageReservation.findMany({
      where: { ownerId, status: "active", createdAt: { gte: periodStart, lt: periodEnd } },
    });
    const failed = await this.prisma.aiUsageRecord.count({
      where: { ownerId, billingPeriodStart: periodStart, status: "failed" },
    });

    const completedInputTokens = completed.reduce((sum, row) => sum + (row.actualInputTokens ?? 0), 0);
    const completedOutputTokens = completed.reduce((sum, row) => sum + (row.actualOutputTokens ?? 0), 0);
    const completedCostMicrosUsd = completed.reduce(
      (sum, row) => sum + bigintToNumber(row.actualCostMicrosUsd),
      0,
    );
    const reservedTokens = activeReservations.reduce(
      (sum, row) => sum + row.reservedInputTokens + row.reservedOutputTokens,
      0,
    );
    const reservedCostMicrosUsd = activeReservations.reduce(
      (sum, row) => sum + bigintToNumber(row.reservedCostMicrosUsd),
      0,
    );

    return this.prisma.usagePeriodAggregate.upsert({
      where: { ownerId_periodStart: { ownerId, periodStart } },
      create: {
        ownerId,
        periodStart,
        periodEnd,
        completedInputTokens,
        completedOutputTokens,
        completedCostMicrosUsd: BigInt(completedCostMicrosUsd),
        reservedTokens,
        reservedCostMicrosUsd: BigInt(reservedCostMicrosUsd),
        operationCount: completed.length,
        failedOperationCount: failed,
      },
      update: {
        completedInputTokens,
        completedOutputTokens,
        completedCostMicrosUsd: BigInt(completedCostMicrosUsd),
        reservedTokens,
        reservedCostMicrosUsd: BigInt(reservedCostMicrosUsd),
        operationCount: completed.length,
        failedOperationCount: failed,
      },
    });
  }

  async findExpiredActiveReservations(now: Date = new Date()) {
    return this.prisma.usageReservation.findMany({
      where: { status: "active", expiresAt: { lt: now } },
      take: 100,
    });
  }
}

export function createRequestFingerprint(jobId: string, attemptNumber: number, suffix = "primary"): string {
  return createHash("sha256").update(`${jobId}:${attemptNumber}:${suffix}`).digest("hex").slice(0, 32);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
