import { logEvent } from "../../lib/structured-log.js";
import type { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { throwPipelineFailure } from "../pipeline-failure.js";
import { PermanentJobError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { GenerationPlanJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof GenerationPlanJobPayloadSchema>;

export function createGenerationPlanHandler(runner: PipelineRunner) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();
    await context.progress.report(20, "Creating the implementation plan");

    const result = await runner.runSegment(data.generationId, "generation_plan_creation", {
      stopAfter: "generation_plan_review",
      onProgress: (progress, message) => context.progress.report(progress, message),
      shouldCancel: () => context.isCancelled(),
      ownsLock: () => context.ownsLock(),
    });

    if (result.outcome === "cancelled") {
      throw new PermanentJobError(ErrorCode.JOB_CANCELLED, "Job was cancelled.");
    }

    if (result.outcome === "failed") {
      throwPipelineFailure(result.code, result.message, result.providerMetadata);
    }

    if (result.outcome === "paused_plan_review") {
      logEvent("generation_plan_created", {
        jobId: context.jobId,
        generationId: data.generationId,
      });
      logEvent("generation_waiting_for_client_review", {
        jobId: context.jobId,
        generationId: data.generationId,
        stage: "generation_plan_review",
      });
      await context.progress.report(100, "Awaiting plan confirmation");
      return {
        waitingForClient: true,
        result: { awaitingPlanConfirmation: true },
      };
    }

    await context.progress.report(100, "Completed");
    return { result: { stage: "generation_plan_creation" } };
  };
}
