import type { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { ProjectGenerationProgress } from "../job-progress.js";
import { PermanentJobError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { ReactProjectGenerationJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof ReactProjectGenerationJobPayloadSchema>;

export function createReactProjectGenerationHandler(runner: PipelineRunner) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();
    await context.progress.report(
      ProjectGenerationProgress.LOADING_PLAN.progress,
      ProjectGenerationProgress.LOADING_PLAN.message,
    );

    const result = await runner.runSegment(data.generationId, "react_project_generation", {
      onProgress: async (progress, message) => {
        await context.progress.report(progress, message);
      },
      shouldCancel: () => context.isCancelled(),
      ownsLock: () => context.ownsLock(),
    });

    if (result.outcome === "paused_sandbox") {
      await context.progress.report(100, "Awaiting browser validation");
      return {
        waitingForClient: true,
        result: { awaitingSandboxValidation: true },
      };
    }

    if (result.outcome === "cancelled") {
      throw new PermanentJobError(ErrorCode.JOB_CANCELLED, "Job was cancelled.");
    }

    if (result.outcome === "failed") {
      throw new PermanentJobError(result.code, result.message);
    }

    const record = context.store.get(data.generationId);
    if (record?.awaitingSandboxValidation) {
      await context.progress.report(100, "Awaiting browser validation");
      return {
        waitingForClient: true,
        result: { awaitingSandboxValidation: true },
      };
    }

    await context.progress.report(
      ProjectGenerationProgress.COMPLETED.progress,
      ProjectGenerationProgress.COMPLETED.message,
    );
    return { result: { stage: "react_project_generation" } };
  };
}
