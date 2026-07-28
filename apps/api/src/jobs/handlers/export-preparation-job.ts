import type { ExportService } from "../../lib/export/ExportService.js";
import type { JobExecutionContext, JobHandlerResult } from "../job-context.js";
import { ExportProgress } from "../job-progress.js";
import { PermanentJobError, classifyProviderError } from "../job-errors.js";
import { ErrorCode } from "@reactify/shared";
import type { ExportPreparationJobPayloadSchema } from "@reactify/shared";
import type { z } from "zod";
import { logError, logEvent } from "../../lib/structured-log.js";

type Payload = z.infer<typeof ExportPreparationJobPayloadSchema>;

export function createExportPreparationHandler(exportService: ExportService) {
  return async (payload: unknown, context: JobExecutionContext): Promise<JobHandlerResult> => {
    const data = payload as Payload;
    await context.assertCanMutate();

    logEvent("export_job_started", {
      generationId: data.generationId,
      exportId: data.exportId,
      jobId: context.jobId,
      workerId: context.workerId,
    });

    const record = context.store.get(data.generationId);
    if (!record) {
      logEvent("export_generation_not_found", {
        generationId: data.generationId,
        exportId: data.exportId,
        jobId: context.jobId,
      });
      throw new PermanentJobError(ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    logEvent("export_generation_loaded", {
      generationId: data.generationId,
      exportId: data.exportId,
      jobId: context.jobId,
      generationStatus: record.status,
      activeVersionId: record.activeVersionId,
      exportCount: record.exports.length,
    });

    if (record.projectHash !== data.expectedProjectHash) {
      const msg = `Project hash mismatch: expected ${data.expectedProjectHash}, got ${record.projectHash ?? "null"}.`;
      logEvent("export_stale_project_hash", {
        generationId: data.generationId,
        exportId: data.exportId,
        jobId: context.jobId,
        expectedHash: data.expectedProjectHash,
        actualHash: record.projectHash,
      });
      // Mark the export as failed before throwing so the frontend can surface the
      // real reason instead of showing a generic 120s deadline message.
      const pendingExport = record.exports.find((e) => e.exportId === data.exportId);
      if (pendingExport && pendingExport.status === "preparing") {
        pendingExport.status = "failed";
        pendingExport.failureReason = msg;
        pendingExport.completedAt = new Date().toISOString();
        record.exportInProgress = false;
        record.updatedAt = pendingExport.completedAt;
        // Best-effort persist so the frontend poll sees "failed" immediately.
        await context.store.persist(record).catch(() => undefined);
      }
      throw new PermanentJobError(ErrorCode.STALE_PROJECT_HASH, msg);
    }

    const activeVersion = record.versions.find((v) => v.versionId === record.activeVersionId);
    logEvent("export_active_version_loaded", {
      generationId: data.generationId,
      exportId: data.exportId,
      jobId: context.jobId,
      activeVersionId: record.activeVersionId,
      versionNumber: activeVersion?.versionNumber,
      hasProject: Boolean(activeVersion?.project),
    });

    try {
      await exportService.executeExportPreparationJob(record, data.exportId, {
        onProgress: (progress, message) => context.progress.report(progress, message),
        shouldCancel: () => context.isCancelled(),
      });

      // The export record is now "ready" in memory.  Persist it to the shared
      // database HERE – inside the handler – before returning to the job-runner.
      // If we only rely on the job-runner's post-handler persist and that DB
      // write fails (network glitch between Railway containers), the export stays
      // "preparing" forever while the job record shows "completed".
      logEvent("export_zip_created", {
        generationId: data.generationId,
        exportId: data.exportId,
        jobId: context.jobId,
        workerId: context.workerId,
        artifactKey: record.exports.find((e) => e.exportId === data.exportId)?.artifactReference,
        fileCount: record.exports.find((e) => e.exportId === data.exportId)?.fileCount,
        totalSizeBytes: record.exports.find((e) => e.exportId === data.exportId)?.totalSizeBytes,
      });

      await context.store.persist(record);

      logEvent("export_record_marked_ready", {
        generationId: data.generationId,
        exportId: data.exportId,
        jobId: context.jobId,
        workerId: context.workerId,
        status: "ready",
      });

      await context.progress.report(ExportProgress.COMPLETED.progress, ExportProgress.COMPLETED.message);
      return { result: { exportId: data.exportId } };
    } catch (error) {
      const exportEntry = record.exports.find((e) => e.exportId === data.exportId);
      logError("export_job_failed", error, {
        generationId: data.generationId,
        exportId: data.exportId,
        jobId: context.jobId,
        workerId: context.workerId,
        exportStatus: exportEntry?.status,
        failureReason: exportEntry?.failureReason,
      });
      throw classifyProviderError(error);
    }
  };
}
