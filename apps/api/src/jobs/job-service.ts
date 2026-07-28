import type { PrismaClient } from "@prisma/client";
import { ErrorCode, JobStatusResponseSchema, microsToUsd, type JobAcceptedResponse, type UsageOperationType } from "@reactify/shared";
import type { Env } from "../env.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { UsageService } from "../usage/usage-service.js";
import { UsageLimitError } from "../usage/usage-service.js";
import { validateJobPayloadForEnqueue } from "./job-contracts.js";
import { createJobConfig, maxAttemptsForJobType } from "./job-config.js";
import { JobRepository } from "./job-repository.js";
import type { BackgroundJobType } from "./job-types.js";
import { CANCELLABLE_JOB_STATUSES, TERMINAL_JOB_STATUSES } from "./job-types.js";
import { syncGenerationForJobStart } from "./generation-sync.js";
import { resolveOperationAIConfig, resolveUsageProviderName } from "../providers/ai-provider-config.js";
import { logError, logEvent } from "../lib/structured-log.js";

export interface EnqueueJobParams {
  generationId: string;
  ownerId: string;
  jobType: BackgroundJobType;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  requestHash?: string;
  parentJobId?: string;
}

export class JobService {
  readonly repository: JobRepository;
  readonly config: ReturnType<typeof createJobConfig>;
  private inlineDispatcher: ((jobId: string) => Promise<void>) | null = null;

  constructor(
    prisma: PrismaClient,
    private readonly env: Env,
    private readonly store: GenerationStore,
    private readonly usageService?: UsageService,
  ) {
    this.config = createJobConfig(env);
    this.repository = new JobRepository(prisma, this.config);
  }

  setInlineDispatcher(dispatcher: (jobId: string) => Promise<void>): void {
    this.inlineDispatcher = dispatcher;
  }

  async enqueue(params: EnqueueJobParams): Promise<{ job: JobAcceptedResponse; created: boolean }> {
    const payload = validateJobPayloadForEnqueue(params.jobType, params.payload);
    const record = this.store.get(params.generationId);
    let jobId: string | null = null;
    let reservationCreated = false;

    try {
      const { job, created } = await this.repository.enqueue({
        generationId: params.generationId,
        ownerId: params.ownerId,
        jobType: params.jobType,
        payload,
        idempotencyKey: params.idempotencyKey,
        requestHash: params.requestHash,
        parentJobId: params.parentJobId,
        maxAttempts: maxAttemptsForJobType(this.config, params.jobType),
      });
      jobId = job.id;

      let reservationMeta:
        | {
            estimatedAiCostUsd: number;
            reservedAiCostUsd: number;
            estimatedTokens: number;
            usageLimitWarning?: string;
          }
        | undefined;

      if (created && this.usageService?.isMeteredJobType(params.jobType)) {
        const aiConfig = resolveOperationAIConfig(this.env, params.jobType as UsageOperationType);
        const reservation = await this.usageService.reserveForJob({
          ownerId: params.ownerId,
          generationId: params.generationId,
          jobId: job.id,
          operationType: params.jobType,
          attemptNumber: 1,
          provider: resolveUsageProviderName(this.env),
          model: aiConfig.model,
          estimate: {
            operationType: params.jobType,
            maxOutputTokens: aiConfig.maxTokens,
          },
        });
        reservationCreated = true;
        reservationMeta = {
          estimatedAiCostUsd: microsToUsd(reservation.estimatedCostMicrosUsd),
          reservedAiCostUsd: microsToUsd(reservation.estimatedCostMicrosUsd),
          estimatedTokens: reservation.estimatedInputTokens + reservation.estimatedOutputTokens,
          usageLimitWarning: reservation.warningMessage,
        };
      }

      if (record) {
        syncGenerationForJobStart(record, params.jobType);
        await this.store.persist(record);
      }

      if (this.config.inlineExecution && this.inlineDispatcher) {
        logEvent("job_inline_dispatch_scheduled", {
          jobId: job.id,
          generationId: params.generationId,
          jobType: params.jobType,
        });
        void this.inlineDispatcher(job.id).catch((error) => {
          logError("job_inline_dispatch_failed", error, {
            jobId: job.id,
            generationId: params.generationId,
            jobType: params.jobType,
          });
        });
      }

      logEvent("job_enqueue_completed", {
        jobId: job.id,
        generationId: params.generationId,
        jobType: params.jobType,
        status: job.status,
        created,
        inlineExecution: this.config.inlineExecution,
      });

      return {
        job: this.toAcceptedResponse(job, reservationMeta),
        created,
      };
    } catch (error) {
      if (jobId) {
        await this.repository.cancelJob(jobId);
        if (reservationCreated && this.usageService?.isMeteredJobType(params.jobType)) {
          await this.usageService.releaseReservationForJob(jobId, 1);
        }
      }

      logError("job_enqueue_failed", error, {
        generationId: params.generationId,
        jobType: params.jobType,
        jobId,
      });
      throw error;
    }
  }

  toAcceptedResponse(
    job: {
      id: string;
      generationId: string;
      jobType: string;
      status: string;
      createdAt: Date;
    },
    usage?: {
      estimatedAiCostUsd: number;
      reservedAiCostUsd: number;
      estimatedTokens: number;
      usageLimitWarning?: string;
    },
  ): JobAcceptedResponse {
    return {
      jobId: job.id,
      generationId: job.generationId,
      jobType: job.jobType as BackgroundJobType,
      status: job.status as JobAcceptedResponse["status"],
      createdAt: job.createdAt.toISOString(),
      statusUrl: `/api/v1/jobs/${job.id}`,
      ...(usage
        ? {
            estimatedAiCostUsd: usage.estimatedAiCostUsd,
            reservedAiCostUsd: usage.reservedAiCostUsd,
            estimatedTokens: usage.estimatedTokens,
            usageLimitWarning: usage.usageLimitWarning,
          }
        : {}),
    };
  }

  toStatusResponse(job: Awaited<ReturnType<JobRepository["getById"]>>) {
    if (!job) {
      return null;
    }

    const cancellationAllowed = CANCELLABLE_JOB_STATUSES.includes(
      job.status as (typeof CANCELLABLE_JOB_STATUSES)[number],
    );

    return JobStatusResponseSchema.parse({
      jobId: job.id,
      generationId: job.generationId,
      jobType: job.jobType,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progressMessage,
      attemptNumber: job.attemptNumber,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      failureCode: job.failureCode,
      failureMessage: job.failureMessage,
      cancellationAllowed,
    });
  }

  async getOwnedJobStatus(jobId: string, ownerId: string) {
    const job = await this.repository.getOwnedJob(jobId, ownerId);
    return this.toStatusResponse(job);
  }

  async listGenerationJobs(query: {
    generationId: string;
    ownerId: string;
    status?: string;
    jobType?: string;
    limit: number;
    offset: number;
    order: "asc" | "desc";
  }) {
    const result = await this.repository.listJobs({
      generationId: query.generationId,
      ownerId: query.ownerId,
      status: query.status as Parameters<JobRepository["listJobs"]>[0]["status"],
      jobType: query.jobType as BackgroundJobType | undefined,
      limit: query.limit,
      offset: query.offset,
      order: query.order,
    });

    return {
      generationId: query.generationId,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
      items: result.items
        .map((job) => this.toStatusResponse(job))
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
  }

  async cancelJob(jobId: string, ownerId: string) {
    const job = await this.repository.getOwnedJob(jobId, ownerId);
    if (!job) {
      return { ok: false as const, code: ErrorCode.JOB_NOT_FOUND };
    }

    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
      return { ok: false as const, code: ErrorCode.JOB_NOT_CANCELLABLE };
    }

    const updated = await this.repository.cancelJob(jobId);
    if (this.usageService?.isMeteredJobType(job.jobType)) {
      await this.usageService.releaseReservationForJob(jobId, Math.max(job.attemptNumber, 1));
    }
    return { ok: true as const, job: this.toStatusResponse(updated) };
  }

  async retryJob(jobId: string, ownerId: string) {
    const job = await this.repository.getOwnedJob(jobId, ownerId);
    if (!job) {
      return { ok: false as const, code: ErrorCode.JOB_NOT_FOUND };
    }

    if (!["failed", "dead_letter"].includes(job.status)) {
      return { ok: false as const, code: ErrorCode.JOB_NOT_RETRYABLE };
    }

    if (job.failureCode && ["PATCH_SECURITY_VIOLATION", "EDIT_SECURITY_VIOLATION"].includes(job.failureCode)) {
      return { ok: false as const, code: ErrorCode.JOB_NOT_RETRYABLE };
    }

    const active = await this.repository.hasActiveMutationJob(job.generationId);
    if (active) {
      return { ok: false as const, code: ErrorCode.JOB_ALREADY_ACTIVE };
    }

    try {
      const enqueued = await this.enqueue({
        generationId: job.generationId,
        ownerId: job.ownerId,
        jobType: job.jobType,
        payload: job.payload as Record<string, unknown>,
        parentJobId: job.id,
        idempotencyKey: `manual-retry-${job.id}-${Date.now()}`,
      });

      return { ok: true as const, job: enqueued.job };
    } catch (error) {
      if (error instanceof UsageLimitError) {
        return { ok: false as const, code: error.code };
      }
      throw error;
    }
  }
}

export { UsageLimitError };
