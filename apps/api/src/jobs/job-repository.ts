import type { Prisma, PrismaClient } from "@prisma/client";
import type { JobConfig } from "./job-config.js";
import type { BackgroundJobStatus, BackgroundJobType } from "./job-types.js";
import type { ProviderFailureMetadata } from "./provider-failure-metadata.js";
import { hashWorkerId } from "./worker-id.js";
import { logJobEnqueueFailure, mapJobEnqueueError } from "../persistence/errors.js";
import { logEvent } from "../lib/structured-log.js";

export interface BackgroundJobRecord {
  id: string;
  generationId: string;
  ownerId: string;
  jobType: BackgroundJobType;
  status: BackgroundJobStatus;
  priority: number;
  payload: Prisma.JsonValue;
  result: Prisma.JsonValue | null;
  progress: number;
  progressMessage: string | null;
  attemptNumber: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lockExpiresAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  lastHeartbeatAt: Date | null;
  idempotencyKey: string | null;
  requestHash: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  parentJobId: string | null;
  correlationId: string;
  cancellationRequested: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueJobInput {
  generationId: string;
  ownerId: string;
  jobType: BackgroundJobType;
  payload: Prisma.InputJsonValue;
  idempotencyKey?: string;
  requestHash?: string;
  priority?: number;
  maxAttempts?: number;
  parentJobId?: string;
  correlationId?: string;
  availableAt?: Date;
}

export interface ListJobsQuery {
  generationId: string;
  ownerId?: string;
  status?: BackgroundJobStatus;
  jobType?: BackgroundJobType;
  limit: number;
  offset: number;
  order: "asc" | "desc";
}

const MUTATION_JOB_TYPES_SQL = `'design_analysis','generation_plan_creation','react_project_generation','automatic_repair','edit_intent_analysis','project_edit_generation','visual_correction','export_preparation'`;

function mapJob(row: {
  id: string;
  generationId: string;
  ownerId: string;
  jobType: string;
  status: string;
  priority: number;
  payload: Prisma.JsonValue;
  result: Prisma.JsonValue | null;
  progress: number;
  progressMessage: string | null;
  attemptNumber: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lockExpiresAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  lastHeartbeatAt: Date | null;
  idempotencyKey: string | null;
  requestHash: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  parentJobId: string | null;
  correlationId: string;
  cancellationRequested: boolean;
  createdAt: Date;
  updatedAt: Date;
}): BackgroundJobRecord {
  return {
    ...row,
    jobType: row.jobType as BackgroundJobType,
    status: row.status as BackgroundJobStatus,
  };
}

/**
 * Job claiming uses PostgreSQL row-level locking with FOR UPDATE SKIP LOCKED
 * inside a transaction. Only one worker can claim a given row; concurrent
 * workers skip locked rows and claim the next eligible job.
 */
export class JobRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: JobConfig,
  ) {}

  async enqueue(input: EnqueueJobInput): Promise<{ job: BackgroundJobRecord; created: boolean }> {
    const idempotencyKey = input.idempotencyKey ?? null;

    if (idempotencyKey) {
      const existing = await this.prisma.backgroundJob.findUnique({
        where: {
          ownerId_generationId_jobType_idempotencyKey: {
            ownerId: input.ownerId,
            generationId: input.generationId,
            jobType: input.jobType,
            idempotencyKey,
          },
        },
      });

      if (existing) {
        return { job: mapJob(existing), created: false };
      }
    }

    try {
      const created = await this.prisma.backgroundJob.create({
        data: {
          generationId: input.generationId,
          ownerId: input.ownerId,
          jobType: input.jobType,
          status: "queued",
          priority: input.priority ?? 0,
          payload: input.payload,
          maxAttempts: input.maxAttempts ?? this.config.defaultMaxAttempts,
          idempotencyKey,
          requestHash: input.requestHash ?? null,
          parentJobId: input.parentJobId ?? null,
          correlationId: input.correlationId ?? undefined,
          availableAt: input.availableAt ?? new Date(),
        },
      });
      logEvent("background_job_inserted", {
        jobId: created.id,
        generationId: input.generationId,
        jobType: input.jobType,
        status: created.status,
        availableAt: created.availableAt.toISOString(),
      });
      return { job: mapJob(created), created: true };
    } catch (error) {
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.prisma.backgroundJob.findUniqueOrThrow({
          where: {
            ownerId_generationId_jobType_idempotencyKey: {
              ownerId: input.ownerId,
              generationId: input.generationId,
              jobType: input.jobType,
              idempotencyKey,
            },
          },
        });
        return { job: mapJob(existing), created: false };
      }
      logJobEnqueueFailure({ generationId: input.generationId }, error);
      throw mapJobEnqueueError(error);
    }
  }

  async getById(jobId: string): Promise<BackgroundJobRecord | null> {
    const row = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    return row ? mapJob(row) : null;
  }

  async getOwnedJob(jobId: string, ownerId: string): Promise<BackgroundJobRecord | null> {
    const row = await this.prisma.backgroundJob.findFirst({
      where: { id: jobId, ownerId },
    });
    return row ? mapJob(row) : null;
  }

  async listJobs(query: ListJobsQuery): Promise<{ total: number; items: BackgroundJobRecord[] }> {
    const where: Prisma.BackgroundJobWhereInput = {
      generationId: query.generationId,
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.jobType ? { jobType: query.jobType } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.backgroundJob.count({ where }),
      this.prisma.backgroundJob.findMany({
        where,
        orderBy: { createdAt: query.order },
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    return { total, items: items.map(mapJob) };
  }

  async hasActiveMutationJob(generationId: string, excludeJobId?: string): Promise<boolean> {
    const count = await this.prisma.backgroundJob.count({
      where: {
        generationId,
        status: { in: ["claimed", "running"] },
        ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
      },
    });
    return count > 0;
  }

  async findLatestJobByType(
    generationId: string,
    jobType: BackgroundJobType,
  ): Promise<BackgroundJobRecord | null> {
    const row = await this.prisma.backgroundJob.findFirst({
      where: { generationId, jobType },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapJob(row) : null;
  }

  async findActiveJobByType(
    generationId: string,
    jobType: BackgroundJobType,
  ): Promise<BackgroundJobRecord | null> {
    const row = await this.prisma.backgroundJob.findFirst({
      where: {
        generationId,
        jobType,
        status: { in: ["queued", "claimed", "running", "retry_scheduled", "waiting_for_client"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapJob(row) : null;
  }

  async findRelevantJobForReconciliation(
    generationId: string,
    jobType: BackgroundJobType,
  ): Promise<BackgroundJobRecord | null> {
    const active = await this.findActiveJobByType(generationId, jobType);
    if (active) {
      return active;
    }

    const latest = await this.findLatestJobByType(generationId, jobType);
    if (!latest) {
      return null;
    }

    const replacement = await this.prisma.backgroundJob.findFirst({
      where: {
        generationId,
        jobType,
        parentJobId: latest.id,
        status: { in: ["queued", "claimed", "running", "retry_scheduled", "waiting_for_client"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return replacement ? mapJob(replacement) : latest;
  }

  async claimJobById(jobId: string, workerId: string): Promise<BackgroundJobRecord | null> {
    const lockExpiresAt = new Date(Date.now() + this.config.lockTtlMs);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b."id"
        FROM "BackgroundJob" b
        WHERE b."id" = ${jobId}::uuid
          AND b.status IN ('queued', 'retry_scheduled')
          AND b."availableAt" <= ${now}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        return null;
      }

      const updated = await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "claimed",
          lockedBy: workerId,
          lockedAt: now,
          lockExpiresAt,
          lastHeartbeatAt: now,
        },
      });

      return mapJob(updated);
    });
  }

  async countClaimableJobs(): Promise<number> {
    const now = new Date();
    return this.prisma.backgroundJob.count({
      where: {
        status: { in: ["queued", "retry_scheduled"] },
        availableAt: { lte: now },
      },
    });
  }

  async claimNextJob(workerId: string): Promise<BackgroundJobRecord | null> {
    const lockExpiresAt = new Date(Date.now() + this.config.lockTtlMs);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b."id"
        FROM "BackgroundJob" b
        WHERE b.status IN ('queued', 'retry_scheduled')
          AND b."availableAt" <= ${now}
          AND NOT EXISTS (
            SELECT 1 FROM "BackgroundJob" active
            WHERE active."generationId" = b."generationId"
              AND active.status IN ('claimed', 'running')
              AND active."id" <> b."id"
          )
        ORDER BY b.priority DESC, b."createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        return null;
      }

      const jobId = rows[0]!.id;

      const updated = await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "claimed",
          lockedBy: workerId,
          lockedAt: now,
          lockExpiresAt,
          lastHeartbeatAt: now,
        },
      });

      return mapJob(updated);
    });
  }

  async startAttempt(jobId: string, workerId: string): Promise<BackgroundJobRecord | null> {
    const now = new Date();
    const lockExpiresAt = new Date(Date.now() + this.config.lockTtlMs);

    return this.prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.findUnique({ where: { id: jobId } });
      if (!job || job.lockedBy !== workerId || !["claimed", "running"].includes(job.status)) {
        return null;
      }

      const attemptNumber = job.attemptNumber + 1;

      await tx.jobAttempt.create({
        data: {
          jobId,
          attemptNumber,
          workerIdHash: hashWorkerId(workerId),
          status: "started",
          startedAt: now,
          heartbeatAt: now,
        },
      });

      const updated = await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          attemptNumber,
          startedAt: job.startedAt ?? now,
          lockExpiresAt,
          lastHeartbeatAt: now,
        },
      });

      return mapJob(updated);
    });
  }

  async heartbeat(jobId: string, workerId: string): Promise<boolean> {
    const now = new Date();
    const lockExpiresAt = new Date(Date.now() + this.config.lockTtlMs);

    const result = await this.prisma.backgroundJob.updateMany({
      where: {
        id: jobId,
        lockedBy: workerId,
        status: { in: ["claimed", "running"] },
      },
      data: {
        lastHeartbeatAt: now,
        lockExpiresAt,
      },
    });

    if (result.count === 0) {
      return false;
    }

    const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (job) {
      await this.prisma.jobAttempt.updateMany({
        where: { jobId, attemptNumber: job.attemptNumber, status: "started" },
        data: { heartbeatAt: now },
      });
    }

    return true;
  }

  async ownsLock(jobId: string, workerId: string): Promise<boolean> {
    const count = await this.prisma.backgroundJob.count({
      where: {
        id: jobId,
        lockedBy: workerId,
        status: { in: ["claimed", "running"] },
        lockExpiresAt: { gt: new Date() },
      },
    });
    return count > 0;
  }

  async updateProgress(
    jobId: string,
    workerId: string,
    progress: number,
    progressMessage: string,
  ): Promise<boolean> {
    const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job || job.lockedBy !== workerId) {
      return false;
    }

    const nextProgress = Math.max(job.progress, Math.min(100, progress));
    await this.prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        progress: nextProgress,
        progressMessage,
      },
    });
    return true;
  }

  async completeJob(
    jobId: string,
    workerId: string,
    result: Prisma.InputJsonValue,
  ): Promise<boolean> {
    const now = new Date();

    const updated = await this.prisma.backgroundJob.updateMany({
      where: {
        id: jobId,
        lockedBy: workerId,
        status: { in: ["claimed", "running"] },
      },
      data: {
        status: "completed",
        progress: 100,
        progressMessage: "Completed",
        result,
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });

    if (updated.count === 0) {
      return false;
    }

    const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (job) {
      await this.prisma.jobAttempt.updateMany({
        where: { jobId, attemptNumber: job.attemptNumber, status: "started" },
        data: { status: "completed", completedAt: now },
      });
    }

    return true;
  }

  async markWaitingForClient(jobId: string, workerId: string, result: Prisma.InputJsonValue): Promise<boolean> {
    const updated = await this.prisma.backgroundJob.updateMany({
      where: {
        id: jobId,
        lockedBy: workerId,
        status: { in: ["claimed", "running"] },
      },
      data: {
        status: "waiting_for_client",
        result,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
    return updated.count > 0;
  }

  async scheduleRetry(
    jobId: string,
    workerId: string,
    availableAt: Date,
    failureCode: string,
    failureMessage: string,
    failureMetadata?: ProviderFailureMetadata,
  ): Promise<boolean> {
    const now = new Date();

    const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job || job.lockedBy !== workerId) {
      return false;
    }

    if (job.attemptNumber >= job.maxAttempts) {
      return this.failJob(jobId, workerId, failureCode, failureMessage, "dead_letter");
    }

    await this.prisma.$transaction([
      this.prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "retry_scheduled",
          availableAt,
          failureCode,
          failureMessage,
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
        },
      }),
      this.prisma.jobAttempt.updateMany({
        where: { jobId, attemptNumber: job.attemptNumber, status: "started" },
        data: {
          status: "failed",
          completedAt: now,
          failureCode,
          failureMessage,
          failureMetadata: failureMetadata as Prisma.InputJsonValue | undefined,
          retryScheduledAt: availableAt,
        },
      }),
    ]);

    return true;
  }

  async failJob(
    jobId: string,
    workerId: string | null,
    failureCode: string,
    failureMessage: string,
    status: "failed" | "dead_letter" = "failed",
    failureMetadata?: ProviderFailureMetadata,
  ): Promise<boolean> {
    const now = new Date();
    const where =
      workerId === null
        ? { id: jobId }
        : {
            id: jobId,
            lockedBy: workerId,
            status: { in: ["claimed", "running", "retry_scheduled", "queued"] as string[] },
          };

    const updated = await this.prisma.backgroundJob.updateMany({
      where,
      data: {
        status,
        failureCode,
        failureMessage,
        failedAt: now,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });

    if (updated.count === 0) {
      return false;
    }

    const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (job && job.attemptNumber > 0) {
      await this.prisma.jobAttempt.updateMany({
        where: { jobId, attemptNumber: job.attemptNumber, status: "started" },
        data: {
          status: "failed",
          completedAt: now,
          failureCode,
          failureMessage,
          failureMetadata: failureMetadata as Prisma.InputJsonValue | undefined,
        },
      });
    }

    return true;
  }

  async cancelJob(jobId: string): Promise<BackgroundJobRecord | null> {
    const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return null;
    }

    if (["completed", "failed", "cancelled", "dead_letter"].includes(job.status)) {
      return mapJob(job);
    }

    if (job.status === "running" || job.status === "claimed") {
      const updated = await this.prisma.backgroundJob.update({
        where: { id: jobId },
        data: { cancellationRequested: true },
      });
      return mapJob(updated);
    }

    const now = new Date();
    const updated = await this.prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        cancelledAt: now,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
    return mapJob(updated);
  }

  async finalizeCancelled(jobId: string, workerId: string): Promise<boolean> {
    const now = new Date();
    const updated = await this.prisma.backgroundJob.updateMany({
      where: { id: jobId, lockedBy: workerId },
      data: {
        status: "cancelled",
        cancelledAt: now,
        failureCode: "JOB_CANCELLED",
        failureMessage: "Job was cancelled.",
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });

    if (updated.count > 0) {
      const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
      if (job) {
        await this.prisma.jobAttempt.updateMany({
          where: { jobId, attemptNumber: job.attemptNumber, status: "started" },
          data: { status: "cancelled", completedAt: now, failureCode: "JOB_CANCELLED" },
        });
      }
    }

    return updated.count > 0;
  }

  async releaseLock(jobId: string, workerId: string): Promise<void> {
    await this.prisma.backgroundJob.updateMany({
      where: { id: jobId, lockedBy: workerId },
      data: {
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
  }

  async findStaleJobs(now: Date = new Date()): Promise<BackgroundJobRecord[]> {
    const heartbeatCutoff = new Date(now.getTime() - this.config.lockTtlMs);
    const rows = await this.prisma.backgroundJob.findMany({
      where: {
        status: { in: ["claimed", "running"] },
        OR: [
          { lockExpiresAt: { lt: now } },
          { lastHeartbeatAt: { lt: heartbeatCutoff } },
          { lastHeartbeatAt: null, lockedAt: { lt: heartbeatCutoff } },
        ],
      },
    });
    return rows.map(mapJob);
  }

  async requeueStaleJob(jobId: string, now: Date = new Date()): Promise<boolean> {
    const heartbeatCutoff = new Date(now.getTime() - this.config.lockTtlMs);
    return this.prisma.$transaction(async (tx) => {
      const staleWhere = {
        id: jobId,
        status: { in: ["claimed", "running"] },
        OR: [
          { lockExpiresAt: { lt: now } },
          { lastHeartbeatAt: { lt: heartbeatCutoff } },
          { lastHeartbeatAt: null, lockedAt: { lt: heartbeatCutoff } },
        ],
      } satisfies Prisma.BackgroundJobWhereInput;

      const job = await tx.backgroundJob.findFirst({ where: staleWhere });
      if (!job) {
        return false;
      }

      const exhausted = job.attemptNumber >= job.maxAttempts;
      const updated = await tx.backgroundJob.updateMany({
        where: staleWhere,
        data: {
          status: exhausted ? "dead_letter" : "retry_scheduled",
          availableAt: exhausted ? job.availableAt : now,
          failedAt: exhausted ? now : null,
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          failureCode: "WORKER_INTERRUPTED",
          failureMessage: exhausted
            ? "Worker was interrupted and the maximum attempt count was reached."
            : "Worker interrupted before completion.",
        },
      });

      if (updated.count > 0) {
        await tx.jobAttempt.updateMany({
          where: { jobId, attemptNumber: job.attemptNumber, status: "started" },
          data: {
            status: "failed",
            completedAt: now,
            failureCode: "WORKER_INTERRUPTED",
            failureMessage: exhausted
              ? "Maximum attempt count reached after worker interruption."
              : "Worker interrupted before completion.",
          },
        });
      }

      return updated.count > 0;
    });
  }

  async getAttempts(jobId: string) {
    return this.prisma.jobAttempt.findMany({
      where: { jobId },
      orderBy: { attemptNumber: "asc" },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export { MUTATION_JOB_TYPES_SQL };
