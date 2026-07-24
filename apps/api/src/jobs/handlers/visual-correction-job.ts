import type { VisualComparisonService } from "../../lib/visual-comparison/VisualComparisonService.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { PermanentJobError, classifyProviderError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { VisualCorrectionJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof VisualCorrectionJobPayloadSchema>;

export function createVisualCorrectionHandler(visualComparisonService: VisualComparisonService) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();
    await context.progress.report(25, "Applying visual correction");

    const record = context.store.get(data.generationId);
    if (!record) {
      throw new PermanentJobError(ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    if (record.projectHash !== data.expectedProjectHash) {
      throw new PermanentJobError(ErrorCode.STALE_PROJECT_HASH, "Project hash is stale.");
    }

    try {
      const result = await visualComparisonService.applyCorrection(record, data.comparisonId, {
        expectedProjectHash: data.expectedProjectHash,
      });

      if (!result.ok) {
        throw new PermanentJobError(result.errorCode, result.message);
      }

      await context.progress.report(100, "Awaiting browser comparison");
      return {
        waitingForClient: true,
        result: {
          comparisonId: data.comparisonId,
          awaitingRevalidation: true,
        },
      };
    } catch (error) {
      throw classifyProviderError(error);
    }
  };
}
