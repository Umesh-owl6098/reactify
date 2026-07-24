import type { ExportService } from "../../lib/export/ExportService.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { ExportProgress } from "../job-progress.js";
import { PermanentJobError, classifyProviderError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { ExportPreparationJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";

type Payload = z.infer<typeof ExportPreparationJobPayloadSchema>;

export function createExportPreparationHandler(exportService: ExportService) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();

    const record = context.store.get(data.generationId);
    if (!record) {
      throw new PermanentJobError(ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    if (record.projectHash !== data.expectedProjectHash) {
      throw new PermanentJobError(ErrorCode.STALE_PROJECT_HASH, "Project hash is stale.");
    }

    try {
      await exportService.executeExportPreparationJob(record, data.exportId, {
        onProgress: (progress, message) => context.progress.report(progress, message),
        shouldCancel: () => context.isCancelled(),
      });

      await context.progress.report(ExportProgress.COMPLETED.progress, ExportProgress.COMPLETED.message);
      return { result: { exportId: data.exportId } };
    } catch (error) {
      throw classifyProviderError(error);
    }
  };
}
