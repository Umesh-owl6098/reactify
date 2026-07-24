-- AI usage tracking, reservations, policies, and period aggregates

CREATE TABLE "AiUsageRecord" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "generationId" UUID,
    "jobId" UUID,
    "operationType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "estimatedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "actualInputTokens" INTEGER,
    "actualOutputTokens" INTEGER,
    "estimatedCostMicrosUsd" BIGINT NOT NULL DEFAULT 0,
    "actualCostMicrosUsd" BIGINT,
    "requestFingerprint" TEXT,
    "providerRequestId" TEXT,
    "usageSource" TEXT,
    "failureCode" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageReservation" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "jobId" UUID,
    "operationType" TEXT NOT NULL,
    "reservedInputTokens" INTEGER NOT NULL,
    "reservedOutputTokens" INTEGER NOT NULL,
    "reservedCostMicrosUsd" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "UsageReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserUsagePolicy" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "monthlyBudgetMicrosUsd" BIGINT,
    "monthlyTokenLimit" INTEGER,
    "perOperationCostLimitMicrosUsd" BIGINT,
    "maxAiOperationsPerDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUsagePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsagePeriodAggregate" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "completedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "completedOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "completedCostMicrosUsd" BIGINT NOT NULL DEFAULT 0,
    "reservedTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedCostMicrosUsd" BIGINT NOT NULL DEFAULT 0,
    "operationCount" INTEGER NOT NULL DEFAULT 0,
    "failedOperationCount" INTEGER NOT NULL DEFAULT 0,
    "dailyOperationCount" INTEGER NOT NULL DEFAULT 0,
    "dailyOperationDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsagePeriodAggregate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsageRecord_jobId_attemptNumber_requestFingerprint_key" ON "AiUsageRecord"("jobId", "attemptNumber", "requestFingerprint");
CREATE INDEX "AiUsageRecord_ownerId_idx" ON "AiUsageRecord"("ownerId");
CREATE INDEX "AiUsageRecord_generationId_idx" ON "AiUsageRecord"("generationId");
CREATE INDEX "AiUsageRecord_jobId_idx" ON "AiUsageRecord"("jobId");
CREATE INDEX "AiUsageRecord_operationType_idx" ON "AiUsageRecord"("operationType");
CREATE INDEX "AiUsageRecord_status_idx" ON "AiUsageRecord"("status");
CREATE INDEX "AiUsageRecord_billingPeriodStart_idx" ON "AiUsageRecord"("billingPeriodStart");
CREATE INDEX "AiUsageRecord_createdAt_idx" ON "AiUsageRecord"("createdAt");

CREATE INDEX "UsageReservation_ownerId_idx" ON "UsageReservation"("ownerId");
CREATE INDEX "UsageReservation_jobId_idx" ON "UsageReservation"("jobId");
CREATE INDEX "UsageReservation_status_idx" ON "UsageReservation"("status");
CREATE INDEX "UsageReservation_expiresAt_idx" ON "UsageReservation"("expiresAt");

CREATE UNIQUE INDEX "UserUsagePolicy_userId_key" ON "UserUsagePolicy"("userId");

CREATE UNIQUE INDEX "UsagePeriodAggregate_ownerId_periodStart_key" ON "UsagePeriodAggregate"("ownerId", "periodStart");
CREATE INDEX "UsagePeriodAggregate_periodStart_idx" ON "UsagePeriodAggregate"("periodStart");
CREATE INDEX "UsagePeriodAggregate_periodEnd_idx" ON "UsagePeriodAggregate"("periodEnd");

ALTER TABLE "AiUsageRecord" ADD CONSTRAINT "AiUsageRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsageRecord" ADD CONSTRAINT "AiUsageRecord_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageReservation" ADD CONSTRAINT "UsageReservation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserUsagePolicy" ADD CONSTRAINT "UserUsagePolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UsagePeriodAggregate" ADD CONSTRAINT "UsagePeriodAggregate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
