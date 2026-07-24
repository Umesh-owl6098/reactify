import type { EditService } from "../../lib/edit/EditService.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { PermanentJobError, classifyProviderError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { EditIntentAnalysisJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof EditIntentAnalysisJobPayloadSchema>;

export function createEditIntentHandler(editService: EditService) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();
    await context.progress.report(20, "Analyzing your requested edit");

    const record = context.store.get(data.generationId);
    if (!record) {
      throw new PermanentJobError(ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    try {
      const result = await editService.executeIntentAnalysisJob(record, data.editId, {
        shouldCancel: () => context.isCancelled(),
      });

      if (result.outcome === "clarification_required") {
        await context.progress.report(100, "Clarification required");
        return {
          waitingForClient: true,
          result: { editId: data.editId, clarificationRequired: true },
        };
      }

      await context.progress.report(100, "Intent analysis completed");
      return {
        result: { editId: data.editId },
        chainJobs: [
          {
            jobType: "project_edit_generation",
            payload: { generationId: data.generationId, editId: data.editId },
            idempotencyKey: `edit-gen-${data.editId}`,
          },
        ],
      };
    } catch (error) {
      throw classifyProviderError(error);
    }
  };
}
