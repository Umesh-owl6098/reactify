import type { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { PermanentJobError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { AutomaticRepairJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof AutomaticRepairJobPayloadSchema>;

export function createAutomaticRepairHandler(runner: PipelineRunner) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();
    await context.progress.report(15, "Repairing compilation errors");

    const result = await runner.runSegment(data.generationId, "automatic_repair", {
      stopAfter: "automatic_repair",
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

    if (result.outcome === "paused_sandbox") {
      await context.progress.report(100, "Awaiting browser revalidation");
      return {
        waitingForClient: true,
        result: { awaitingSandboxValidation: true },
      };
    }

    await context.progress.report(100, "Repair completed");
    return { result: { stage: "automatic_repair" } };
  };
}
