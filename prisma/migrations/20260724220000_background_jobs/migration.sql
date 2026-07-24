-- Background job queue for long-running operations.
-- In-progress generations without jobs at migration time remain in their
-- persisted status; no automatic AI re-invocation occurs.

CREATE TABLE "BackgroundJob" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressMessage" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "parentJobId" UUID,
    "correlationId" UUID NOT NULL,
    "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobAttempt" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "workerIdHash" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "retryScheduledAt" TIMESTAMP(3),
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackgroundJob_ownerId_generationId_jobType_idempotencyKey_key"
ON "BackgroundJob"("ownerId", "generationId", "jobType", "idempotencyKey");

CREATE INDEX "BackgroundJob_status_idx" ON "BackgroundJob"("status");
CREATE INDEX "BackgroundJob_availableAt_idx" ON "BackgroundJob"("availableAt");
CREATE INDEX "BackgroundJob_generationId_idx" ON "BackgroundJob"("generationId");
CREATE INDEX "BackgroundJob_ownerId_idx" ON "BackgroundJob"("ownerId");
CREATE INDEX "BackgroundJob_jobType_idx" ON "BackgroundJob"("jobType");
CREATE INDEX "BackgroundJob_lockExpiresAt_idx" ON "BackgroundJob"("lockExpiresAt");
CREATE INDEX "BackgroundJob_parentJobId_idx" ON "BackgroundJob"("parentJobId");
CREATE INDEX "BackgroundJob_createdAt_idx" ON "BackgroundJob"("createdAt");

CREATE INDEX "JobAttempt_jobId_idx" ON "JobAttempt"("jobId");
CREATE INDEX "JobAttempt_attemptNumber_idx" ON "JobAttempt"("attemptNumber");

ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_generationId_fkey"
FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_parentJobId_fkey"
FOREIGN KEY ("parentJobId") REFERENCES "BackgroundJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
