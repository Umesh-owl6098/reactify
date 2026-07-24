import type { Prisma } from "@prisma/client";
import { ErrorCode } from "@reactify/shared";
import type { UsageOperationType } from "@reactify/shared";
import type { Env } from "../env.js";
import type { GenerationStore } from "../pipeline/store.js";
import { runWithUsageContext, wasProviderInvoked } from "../usage/usage-context.js";
import type { UsageService } from "../usage/usage-service.js";
import { UsageLimitError } from "../usage/usage-service.js";
import { validateJobPayload } from "./job-contracts.js";
import type { JobConfig } from "./job-config.js";
import { computeRetryDelayMs } from "./job-config.js";
import type { JobExecutionContext, JobHandler } from "./job-context.js";
import {
  JobCancelledError,
  PermanentJobError,
  TransientJobError,
  classifyProviderError,
  isTransientError,
} from "./job-errors.js";
import { createProgressReporter } from "./job-progress.js";
import type { JobRepository } from "./job-repository.js";
import type { JobService } from "./job-service.js";
import type { BackgroundJobType } from "./job-types.js";
import { syncGenerationForJobFailure } from "./generation-sync.js";
import { recordWorkerPresence } from "./worker-presence.js";
import { getWorkerId } from "./worker-id.js";

export interface JobRunnerDeps {
  repository: JobRepository;
  store: GenerationStore;
  registry: Map<BackgroundJobType, JobHandler>;
  config: JobConfig;
  jobService: JobService;
  usageService?: UsageService;
  env: Env;
  workerPresenceFile?: string;
  logger?: JobRunnerLogger;
}

export interface JobRunnerLogger {
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
}

export class JobRunner {
  private pollTimer: NodeJS.Timeout | null = null;
  private staleTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private activeExecutions = 0;
  private readonly workerId = getWorkerId();

  constructor(private readonly deps: JobRunnerDeps) {}

  start(): void {
    if (this.pollTimer) {
      return;
    }

    void this.recoverStaleJobs();
    void this.recordPresence();

    this.deps.logger?.info("worker_polling_started", {
      pollIntervalMs: this.deps.config.pollIntervalMs,
      workerConcurrency: this.deps.config.workerConcurrency,
      registeredHandlers: [...this.deps.registry.keys()],
    });

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.deps.config.pollIntervalMs);

    this.staleTimer = setInterval(() => {
      void this.recoverStaleJobs();
    }, this.deps.config.staleRecoveryIntervalMs);
  }

  stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }

    const started = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (this.activeExecutions === 0 || Date.now() - started >= this.deps.config.shutdownGraceMs) {
          resolve();
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  async drain(): Promise<void> {
    for (let i = 0; i < 50; i += 1) {
      await this.pollOnce();
      const claimed = await this.deps.repository.claimNextJob(this.workerId);
      if (!claimed) {
        return;
      }
      await this.executeJob(claimed.id);
    }
  }

  async executeJobById(jobId: string): Promise<void> {
    let job = await this.deps.repository.getById(jobId);
    if (!job) {
      return;
    }

    if (job.status === "queued" || job.status === "retry_scheduled") {
      const claimed = await this.deps.repository.claimJobById(jobId, this.workerId);
      if (!claimed) {
        return;
      }
      job = claimed;
    }

    await this.executeJob(jobId, true);
  }

  private async poll(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    await this.recordPresence();

    const slots = this.deps.config.workerConcurrency - this.activeExecutions;
    for (let i = 0; i < slots; i += 1) {
      await this.pollOnce();
    }
  }

  private async pollOnce(): Promise<void> {
    const claimed = await this.deps.repository.claimNextJob(this.workerId);
    if (!claimed) {
      return;
    }

    this.activeExecutions += 1;
    void this.executeJob(claimed.id).finally(() => {
      this.activeExecutions -= 1;
    });
  }

  private async executeJob(jobId: string, skipClaim = false): Promise<void> {
    const startedAt = Date.now();
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let attemptNumber = 1;

    try {
      let job = skipClaim ? await this.deps.repository.getById(jobId) : null;
      if (!skipClaim) {
        job = await this.deps.repository.getById(jobId);
      }

      if (!job) {
        return;
      }

      if (job.cancellationRequested || job.status === "cancelled") {
        await this.deps.repository.finalizeCancelled(jobId, this.workerId);
        if (this.deps.usageService?.isMeteredJobType(job.jobType)) {
          await this.deps.usageService.releaseReservationForJob(jobId, Math.max(job.attemptNumber, 1));
        }
        return;
      }

      const running = await this.deps.repository.startAttempt(jobId, this.workerId);
      if (!running) {
        return;
      }

      job = running;
      attemptNumber = job.attemptNumber;
      this.deps.logger?.info("job_started", {
        jobId,
        generationId: job.generationId,
        jobType: job.jobType,
        attemptNumber: job.attemptNumber,
        correlationId: job.correlationId,
      });

      heartbeatTimer = setInterval(() => {
        void this.deps.repository.heartbeat(jobId, this.workerId);
      }, this.deps.config.heartbeatIntervalMs);

      const handler = this.deps.registry.get(job.jobType as BackgroundJobType);
      if (!handler) {
        await this.deps.repository.failJob(jobId, this.workerId, ErrorCode.INTERNAL_ERROR, "Unknown job type.");
        return;
      }

      let reservationId: string | undefined;
      if (this.deps.usageService?.isMeteredJobType(job.jobType)) {
        let reservation = await this.deps.usageService.repository.getActiveReservationForJob(jobId, attemptNumber);
        if (!reservation && attemptNumber > 1) {
          const reserved = await this.deps.usageService.reserveForJob({
            ownerId: job.ownerId,
            generationId: job.generationId,
            jobId,
            operationType: job.jobType,
            attemptNumber,
            provider: this.deps.env.AI_PROVIDER === "mock" ? "mock" : "anthropic",
            model: this.deps.env.ANTHROPIC_MODEL,
            estimate: {
              operationType: job.jobType as UsageOperationType,
              maxOutputTokens: this.deps.env.AI_MAX_TOKENS,
            },
          });
          reservation = await this.deps.usageService.repository.prisma.usageReservation.findUnique({
            where: { id: reserved.reservationId },
          });
        }
        reservationId = reservation?.id;
        if (!reservationId) {
          throw new PermanentJobError(ErrorCode.AI_USAGE_RESERVATION_FAILED, "Active usage reservation not found.");
        }
      }

      const payload = validateJobPayload(job.jobType as BackgroundJobType, job.payload);
      const progress = createProgressReporter(this.deps.repository, jobId, this.workerId);

      const context: JobExecutionContext = {
        jobId,
        generationId: job.generationId,
        ownerId: job.ownerId,
        workerId: this.workerId,
        attemptNumber: job.attemptNumber,
        progress,
        store: this.deps.store,
        repository: this.deps.repository,
        isCancelled: async () => {
          const current = await this.deps.repository.getById(jobId);
          return (
            !current ||
            current.cancellationRequested ||
            current.status === "cancelled" ||
            this.deps.store.get(job.generationId)?.cancelled === true
          );
        },
        ownsLock: () => this.deps.repository.ownsLock(jobId, this.workerId),
        assertCanMutate: async () => {
          if (!(await this.deps.repository.ownsLock(jobId, this.workerId))) {
            throw new JobCancelledError(ErrorCode.WORKER_INTERRUPTED, "Job lock was lost.");
          }
          const record = this.deps.store.get(job.generationId);
          if (record?.cancelled) {
            throw new JobCancelledError(ErrorCode.GENERATION_CANCELLED, "Generation was cancelled.");
          }
          const current = await this.deps.repository.getById(jobId);
          if (current?.cancellationRequested) {
            throw new JobCancelledError();
          }
        },
      };

      const executeHandler = async () => handler(payload, context);

      const result = reservationId
        ? await runWithUsageContext(
            {
              ownerId: job.ownerId,
              generationId: job.generationId,
              jobId,
              operationType: job.jobType as UsageOperationType,
              attemptNumber,
              reservationId,
              providerInvoked: false,
            },
            executeHandler,
          )
        : await executeHandler();

      if (!(await this.deps.repository.ownsLock(jobId, this.workerId))) {
        return;
      }

      const record = this.deps.store.get(job.generationId);
      if (record) {
        void this.deps.store.persist(record);
      }

      if (result.waitingForClient) {
        await this.deps.repository.markWaitingForClient(
          jobId,
          this.workerId,
          (result.result ?? {}) as Prisma.InputJsonValue,
        );
        this.deps.logger?.info("job_waiting_for_client", { jobId, generationId: job.generationId, jobType: job.jobType });
        return;
      }

      const completed = await this.deps.repository.completeJob(
        jobId,
        this.workerId,
        (result.result ?? {}) as Prisma.InputJsonValue,
      );

      if (completed && result.chainJobs?.length) {
        for (const chained of result.chainJobs) {
          await this.deps.jobService.enqueue({
            generationId: job.generationId,
            ownerId: job.ownerId,
            jobType: chained.jobType,
            payload: chained.payload,
            idempotencyKey: chained.idempotencyKey,
            parentJobId: jobId,
          });
        }
      }

      this.deps.logger?.info("job_completed", {
        jobId,
        generationId: job.generationId,
        jobType: job.jobType,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (
        this.deps.usageService &&
        !wasProviderInvoked()
      ) {
        await this.deps.usageService.releaseReservationForJob(jobId, attemptNumber);
      }
      await this.handleExecutionFailure(jobId, error);
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  }

  private async handleExecutionFailure(jobId: string, error: unknown): Promise<void> {
    const job = await this.deps.repository.getById(jobId);
    if (!job) {
      return;
    }

    const classified = error instanceof JobCancelledError
      ? error
      : error instanceof PermanentJobError || error instanceof TransientJobError
        ? error
        : error instanceof UsageLimitError
          ? new PermanentJobError(error.code, error.message)
        : classifyProviderError(error);

    const record = this.deps.store.get(job.generationId);
    if (record) {
      syncGenerationForJobFailure(record, classified.code);
      void this.deps.store.persist(record);
    }

    if (classified instanceof JobCancelledError) {
      await this.deps.repository.finalizeCancelled(jobId, this.workerId);
      if (this.deps.usageService?.isMeteredJobType(job.jobType) && !wasProviderInvoked()) {
        await this.deps.usageService.releaseReservationForJob(jobId, job.attemptNumber);
      }
      this.deps.logger?.info("job_cancelled", { jobId, generationId: job.generationId });
      return;
    }

    if (isTransientError(classified) && job.attemptNumber < job.maxAttempts) {
      if (this.deps.usageService?.isMeteredJobType(job.jobType) && !wasProviderInvoked()) {
        await this.deps.usageService.releaseReservationForJob(jobId, job.attemptNumber);
      }
      const delayMs = computeRetryDelayMs(this.deps.config, job.attemptNumber);
      const availableAt = new Date(Date.now() + delayMs);
      await this.deps.repository.scheduleRetry(
        jobId,
        this.workerId,
        availableAt,
        classified.code,
        classified.message,
      );
      this.deps.logger?.warn("job_retry_scheduled", {
        jobId,
        generationId: job.generationId,
        attemptNumber: job.attemptNumber,
        availableAt: availableAt.toISOString(),
      });
      return;
    }

    const terminalStatus = job.attemptNumber >= job.maxAttempts ? "dead_letter" : "failed";
    await this.deps.repository.failJob(jobId, this.workerId, classified.code, classified.message, terminalStatus);
    this.deps.logger?.error("job_failed", {
      jobId,
      generationId: job.generationId,
      failureCode: classified.code,
    });
  }

  async recoverStaleJobs(): Promise<void> {
    const staleJobs = await this.deps.repository.findStaleJobs();
    for (const job of staleJobs) {
      const requeued = await this.deps.repository.requeueStaleJob(job.id);
      if (requeued) {
        this.deps.logger?.warn("stale_lock_recovered", {
          jobId: job.id,
          generationId: job.generationId,
          jobType: job.jobType,
        });
      }
    }
  }

  private async recordPresence(): Promise<void> {
    if (!this.deps.workerPresenceFile) {
      return;
    }

    try {
      await recordWorkerPresence(this.deps.workerPresenceFile, {
        pollIntervalMs: this.deps.config.pollIntervalMs,
        workerConcurrency: this.deps.config.workerConcurrency,
        registeredHandlers: [...this.deps.registry.keys()],
      });
    } catch (error) {
      this.deps.logger?.warn("worker_presence_write_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
