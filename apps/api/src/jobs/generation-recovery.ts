import { ErrorCode } from "@reactify/shared";
import type { PipelineStageName } from "@reactify/generation-contracts";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { GenerationRecord } from "../pipeline/types.js";
import type { JobService } from "./job-service.js";
import type { BackgroundJobType } from "./job-types.js";

export const RECOVERABLE_FAILURE_CODES = new Set<string>([
  ErrorCode.JOB_NOT_FOUND,
  ErrorCode.JOB_STALLED,
  ErrorCode.WORKER_INTERRUPTED,
  ErrorCode.JOB_ENQUEUE_FAILED,
]);

const STAGE_JOB_TYPE: Partial<Record<PipelineStageName, BackgroundJobType>> = {
  design_analysis: "design_analysis",
  generation_plan_creation: "generation_plan_creation",
  react_project_generation: "react_project_generation",
  automatic_repair: "automatic_repair",
};

export function isGenerationRetryAllowed(record: GenerationRecord): boolean {
  if (record.status !== "Failed" || !record.manualRetryAllowed || record.cancelled || record.deletedAt) {
    return false;
  }

  const latestError = record.errors.at(-1);
  if (!latestError || !RECOVERABLE_FAILURE_CODES.has(latestError.code)) {
    return false;
  }

  if (record.failStage === "design_analysis") {
    return !record.outputs.designAnalysis;
  }

  return Boolean(record.failStage && STAGE_JOB_TYPE[record.failStage]);
}

export type RecoverGenerationResult =
  | { ok: true; jobId: string; created: boolean }
  | { ok: false; code: string; message: string };

export async function recoverFailedGeneration(input: {
  record: GenerationRecord;
  store: GenerationStore;
  jobService: JobService;
  imageStorage: ImageStorage;
  ownerId: string;
}): Promise<RecoverGenerationResult> {
  const { record, store, jobService, imageStorage, ownerId } = input;

  if (ownerId !== record.ownerId) {
    return { ok: false, code: ErrorCode.FORBIDDEN, message: "Generation not found." };
  }

  const failStage = record.failStage ?? "design_analysis";
  const jobType = STAGE_JOB_TYPE[failStage];
  if (!jobType) {
    return {
      ok: false,
      code: ErrorCode.INVALID_GENERATION_STATE,
      message: "This failure stage does not support automatic retry.",
    };
  }

  const activeJob = await jobService.repository.findActiveJobByType(record.id, jobType);
  if (activeJob) {
    return { ok: true, jobId: activeJob.id, created: false };
  }

  if (record.cancelled || record.deletedAt) {
    return { ok: false, code: ErrorCode.INVALID_GENERATION_STATE, message: "Cancelled generations cannot be retried." };
  }

  if (!isGenerationRetryAllowed(record)) {
    return {
      ok: false,
      code: ErrorCode.INVALID_GENERATION_STATE,
      message: "This generation cannot be retried in its current state.",
    };
  }

  if (jobType === "design_analysis") {
    const image = await imageStorage.get(record.imageId);
    if (!image) {
      return {
        ok: false,
        code: ErrorCode.IMAGE_NOT_FOUND,
        message: "The uploaded screenshot for this generation is no longer available.",
      };
    }

    if (record.outputs.designAnalysis) {
      return {
        ok: false,
        code: ErrorCode.INVALID_GENERATION_STATE,
        message: "Design analysis already exists for this generation.",
      };
    }
  }

  const recovered = store.recoverFromWorkerFailure(record.id, jobType);
  if (!recovered) {
    return {
      ok: false,
      code: ErrorCode.INVALID_GENERATION_STATE,
      message: "This generation cannot be retried in its current state.",
    };
  }

  try {
    const accepted = await jobService.enqueue({
      generationId: record.id,
      ownerId,
      jobType,
      payload:
        jobType === "design_analysis"
          ? { generationId: record.id, imageId: record.imageId }
          : { generationId: record.id },
      idempotencyKey: `recovery-${jobType}-${record.id}`,
    });

    await store.persistById(record.id);
    return { ok: true, jobId: accepted.job.jobId, created: accepted.created };
  } catch (error) {
    const failureCode =
      error instanceof Error && "code" in error
        ? String((error as { code?: string }).code)
        : ErrorCode.JOB_ENQUEUE_FAILED;
    const failureMessage =
      error instanceof Error ? error.message : "Unable to queue the recovery job.";

    store.markFailed(record.id, failStage, failureCode, failureMessage, { manualRetryAllowed: true });
    await store.persistById(record.id);

    return {
      ok: false,
      code: failureCode,
      message: failureMessage,
    };
  }
}
