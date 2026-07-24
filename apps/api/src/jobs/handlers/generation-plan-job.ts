import type { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
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
      throw new PermanentJobError(result.code, result.message);
    }

    if (result.outcome === "paused_plan_review") {
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
