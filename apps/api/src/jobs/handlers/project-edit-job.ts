import type { EditService } from "../../lib/edit/EditService.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { PermanentJobError, classifyProviderError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { ProjectEditGenerationJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof ProjectEditGenerationJobPayloadSchema>;

export function createProjectEditHandler(editService: EditService) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();
    await context.progress.report(30, "Applying your requested edit");

    const record = context.store.get(data.generationId);
    if (!record) {
      throw new PermanentJobError(ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    try {
      const result = await editService.executeProjectEditJob(record, data.editId, {
        shouldCancel: () => context.isCancelled(),
      });

      if (result.outcome === "awaiting_confirmation") {
        await context.progress.report(100, "Awaiting confirmation");
        return {
          waitingForClient: true,
          result: { editId: data.editId, awaitingConfirmation: true },
        };
      }

      if (result.outcome === "awaiting_sandbox") {
        await context.progress.report(100, "Awaiting browser validation");
        return {
          waitingForClient: true,
          result: { editId: data.editId, awaitingSandboxValidation: true },
        };
      }

      await context.progress.report(100, "Edit completed");
      return { result: { editId: data.editId } };
    } catch (error) {
      throw classifyProviderError(error);
    }
  };
}
