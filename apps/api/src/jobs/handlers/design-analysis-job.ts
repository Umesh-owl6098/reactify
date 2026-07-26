import { logEvent } from "../../lib/structured-log.js";
import type { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { DesignAnalysisProgress } from "../job-progress.js";
import { throwPipelineFailure } from "../pipeline-failure.js";
import { PermanentJobError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { DesignAnalysisJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof DesignAnalysisJobPayloadSchema>;

export function createDesignAnalysisHandler(runner: PipelineRunner) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    logEvent("design_analysis_handler_started", {
      jobId: context.jobId,
      generationId: data.generationId,
      imageId: data.imageId,
      attemptNumber: context.attemptNumber,
    });
    await context.assertCanMutate();
    await context.progress.report(
      DesignAnalysisProgress.VALIDATING.progress,
      DesignAnalysisProgress.VALIDATING.message,
    );

    const record = context.store.get(data.generationId);
    if (!record) {
      throw new PermanentJobError(ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    await context.progress.report(
      DesignAnalysisProgress.LOADING_IMAGE.progress,
      DesignAnalysisProgress.LOADING_IMAGE.message,
    );
    await context.progress.report(
      DesignAnalysisProgress.PREPARING.progress,
      DesignAnalysisProgress.PREPARING.message,
    );
    await context.progress.report(
      DesignAnalysisProgress.ANALYZING.progress,
      DesignAnalysisProgress.ANALYZING.message,
    );

    const result = await runner.runSegment(data.generationId, undefined, {
      stopAfter: "design_analysis",
      onProgress: (progress: number, message: string) => context.progress.report(progress, message),
      shouldCancel: () => context.isCancelled(),
      ownsLock: () => context.ownsLock(),
    });

    logEvent("design_analysis_handler_segment_finished", {
      jobId: context.jobId,
      generationId: data.generationId,
      outcome: result.outcome,
      ...(result.outcome === "failed" ? { failureCode: result.code, failureMessage: result.message } : {}),
    });

    if (result.outcome === "cancelled") {
      throw new PermanentJobError(ErrorCode.JOB_CANCELLED, "Job was cancelled.");
    }

    if (result.outcome === "failed") {
      throwPipelineFailure(result.code, result.message, result.providerMetadata);
    }

    logEvent("design_analysis_completed", {
      jobId: context.jobId,
      generationId: data.generationId,
      imageId: data.imageId,
    });

    await context.progress.report(
      DesignAnalysisProgress.VALIDATING_RESPONSE.progress,
      DesignAnalysisProgress.VALIDATING_RESPONSE.message,
    );
    await context.progress.report(
      DesignAnalysisProgress.COMPLETED.progress,
      DesignAnalysisProgress.COMPLETED.message,
    );

    return {
      result: { stage: "design_analysis" },
      chainJobs: [
        {
          jobType: "generation_plan_creation",
          payload: { generationId: data.generationId },
          idempotencyKey: `plan-${data.generationId}`,
        },
      ],
    };
  };
}
