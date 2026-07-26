import type { PipelineStageName } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import type { GenerationStore } from "../pipeline/store.js";
import type { GenerationRecord } from "../pipeline/types.js";
import type { JobConfig } from "./job-config.js";
import type { JobRepository } from "./job-repository.js";
import type { BackgroundJobType } from "./job-types.js";

interface StaleReconciliationJobService {
  enqueue(input: {
    generationId: string;
    ownerId: string;
    jobType: BackgroundJobType;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<unknown>;
}

const STATUS_EXPECTED_JOB: Partial<Record<GenerationRecord["status"], BackgroundJobType>> = {
  Analyzing: "design_analysis",
  Planning: "generation_plan_creation",
  Generating: "react_project_generation",
  Repairing: "automatic_repair",
};

const SUCCESSOR_JOB: Partial<Record<BackgroundJobType, BackgroundJobType>> = {
  design_analysis: "generation_plan_creation",
  generation_plan_creation: "react_project_generation",
  react_project_generation: "automatic_repair",
};

const PENDING_JOB_STATUSES = new Set(["queued", "claimed", "running", "retry_scheduled", "waiting_for_client"]);
const TERMINAL_JOB_STATUSES = new Set(["failed", "dead_letter", "cancelled"]);

const STAGE_BY_JOB_TYPE: Partial<Record<BackgroundJobType, PipelineStageName>> = {
  design_analysis: "design_analysis",
  generation_plan_creation: "generation_plan_creation",
  react_project_generation: "react_project_generation",
  automatic_repair: "automatic_repair",
};

function failGeneration(
  store: GenerationStore,
  record: GenerationRecord,
  jobType: BackgroundJobType,
  code: string,
  message: string,
  options?: { manualRetryAllowed?: boolean },
): void {
  const stage = STAGE_BY_JOB_TYPE[jobType] ?? "design_analysis";
  store.markFailed(record.id, stage, code, message, options);
}

function inconsistencyAgeMs(record: GenerationRecord): number {
  return Date.now() - new Date(record.updatedAt).getTime();
}

export async function reconcileStaleGenerationState(
  generationId: string,
  store: GenerationStore,
  repository: JobRepository,
  config: Pick<JobConfig, "staleGenerationThresholdMs" | "jobMissingGraceMs" | "lockTtlMs">,
  jobService?: StaleReconciliationJobService,
): Promise<void> {
  const record = store.get(generationId);
  if (!record || record.status === "Failed" || record.status === "Cancelled" || record.status === "Ready") {
    return;
  }

  if (record.status === "Planning" && record.awaitingPlanConfirmation) {
    return;
  }

  if (record.status === "Compiling" || record.awaitingSandboxValidation) {
    return;
  }

  const expectedJobType = STATUS_EXPECTED_JOB[record.status];
  if (!expectedJobType) {
    return;
  }

  let relevantJob;
  try {
    relevantJob = await repository.findRelevantJobForReconciliation(generationId, expectedJobType);
  } catch {
    return;
  }

  if (!relevantJob) {
    if (inconsistencyAgeMs(record) < config.jobMissingGraceMs) {
      return;
    }

    failGeneration(
      store,
      record,
      expectedJobType,
      ErrorCode.JOB_NOT_FOUND,
      "The background job for this step was never created. Retry after confirming the worker is running.",
      { manualRetryAllowed: true },
    );
    return;
  }

  if (PENDING_JOB_STATUSES.has(relevantJob.status)) {
    if (relevantJob.status === "claimed" || relevantJob.status === "running") {
      const heartbeatAt =
        relevantJob.lastHeartbeatAt ?? relevantJob.lockedAt ?? relevantJob.startedAt ?? relevantJob.updatedAt;
      if (heartbeatAt && Date.now() - heartbeatAt.getTime() >= config.lockTtlMs) {
        await repository.requeueStaleJob(relevantJob.id);
      }
      return;
    }

    const staleMs = inconsistencyAgeMs(record);
    if (relevantJob.status === "queued" && staleMs >= config.staleGenerationThresholdMs) {
      failGeneration(
        store,
        record,
        expectedJobType,
        ErrorCode.JOB_STALLED,
        "This step is waiting for the Reactify worker. Start the worker process and retry.",
        { manualRetryAllowed: true },
      );
    }
    return;
  }

  if (TERMINAL_JOB_STATUSES.has(relevantJob.status)) {
    const terminalAgeMs = relevantJob.updatedAt ? Date.now() - relevantJob.updatedAt.getTime() : inconsistencyAgeMs(record);
    if (terminalAgeMs < config.jobMissingGraceMs) {
      return;
    }

    const code = relevantJob.failureCode ?? ErrorCode.JOB_STALLED;
    const message = relevantJob.failureMessage ?? "The background job for this step failed.";
    failGeneration(store, record, expectedJobType, code, message, { manualRetryAllowed: true });
    return;
  }

  if (relevantJob.status === "completed") {
    const previewReadyCompleted = record.stages.some(
      (stage) => stage.stage === "preview_ready" && stage.status === "completed",
    );
    const sandboxSucceeded =
      record.sandboxValidation?.compilation.success === true &&
      record.sandboxValidation?.runtime.success === true;

    if (
      record.status === "Repairing" &&
      expectedJobType === "automatic_repair" &&
      record.repairStatus === "succeeded" &&
      sandboxSucceeded &&
      !previewReadyCompleted &&
      jobService
    ) {
      const activeRepair = await repository.findActiveJobByType(generationId, "automatic_repair");
      if (!activeRepair) {
        await jobService.enqueue({
          generationId,
          ownerId: record.ownerId,
          jobType: "automatic_repair",
          payload: { generationId },
          idempotencyKey: `finish-preview-${generationId}`,
        });
      }
      return;
    }

    const successorType = SUCCESSOR_JOB[expectedJobType];
    if (successorType) {
      const successorJob = await repository.findRelevantJobForReconciliation(generationId, successorType);
      if (
        successorJob &&
        (PENDING_JOB_STATUSES.has(successorJob.status) || successorJob.status === "waiting_for_client")
      ) {
        return;
      }
    }

    const completedAgeMs = relevantJob.updatedAt
      ? Date.now() - relevantJob.updatedAt.getTime()
      : inconsistencyAgeMs(record);
    if (completedAgeMs < config.jobMissingGraceMs) {
      return;
    }

    if (record.status === "Analyzing" && expectedJobType === "design_analysis") {
      failGeneration(
        store,
        record,
        expectedJobType,
        ErrorCode.JOB_STALLED,
        "Design analysis completed but the generation did not advance. Retry to continue.",
        { manualRetryAllowed: true },
      );
      return;
    }

  }
}
