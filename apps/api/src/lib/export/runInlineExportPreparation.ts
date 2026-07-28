import { ErrorCode } from "@reactify/shared";
import type { JobRunner } from "../../jobs/job-runner.js";
import type { JobRepository } from "../../jobs/job-repository.js";
import { TERMINAL_JOB_STATUSES } from "../../jobs/job-types.js";
import type { GenerationStore } from "../../pipeline/store.js";
import type { ExportService } from "./ExportService.js";
import { logError, logEvent } from "../structured-log.js";

export type InlineExportPreparationResult =
  | {
      ok: true;
      status: "ready";
      jobId: string;
      exportId: string;
      generationId: string;
    }
  | {
      ok: false;
      status: "failed";
      jobId: string;
      exportId: string;
      generationId: string;
      errorCode: string;
      message: string;
    };

async function waitForTerminalJob(
  repository: JobRepository,
  jobId: string,
  timeoutMs: number,
): Promise<Awaited<ReturnType<JobRepository["getById"]>>> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const job = await repository.getById(jobId);
    if (!job) {
      return null;
    }
    if (TERMINAL_JOB_STATUSES.includes(job.status as (typeof TERMINAL_JOB_STATUSES)[number])) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return repository.getById(jobId);
}

export async function runInlineExportPreparation(input: {
  jobRunner: JobRunner;
  repository: JobRepository;
  exportService: ExportService;
  store: GenerationStore;
  generationId: string;
  exportId: string;
  jobId: string;
}): Promise<InlineExportPreparationResult> {
  const { jobRunner, repository, exportService, store, generationId, exportId, jobId } = input;

  logEvent("export_inline_execution_started", {
    generationId,
    exportId,
    jobId,
  });

  const readExportRecord = () => {
    const record = store.get(generationId);
    return record ? exportService.getExport(record, exportId) : undefined;
  };

  const markPreparingExportFailed = (message: string) => {
    const exportRecord = readExportRecord();
    if (exportRecord && exportRecord.status === "preparing") {
      exportRecord.status = "failed";
      exportRecord.failureReason = message;
      exportRecord.completedAt = new Date().toISOString();
      const record = store.get(generationId);
      if (record) {
        record.exportInProgress = false;
        record.updatedAt = exportRecord.completedAt;
      }
    }
  };

  try {
    await jobRunner.executeJobById(jobId);
    const terminalJob = await waitForTerminalJob(repository, jobId, 60_000);

    const exportRecord = readExportRecord();
    if (exportRecord?.status === "ready") {
      logEvent("export_inline_execution_completed", {
        generationId,
        exportId,
        jobId,
        status: "ready",
      });
      return { ok: true, status: "ready", jobId, exportId, generationId };
    }

    if (exportRecord?.status === "failed") {
      const message = exportRecord.failureReason ?? "Export preparation failed.";
      logEvent("export_inline_execution_failed", {
        generationId,
        exportId,
        jobId,
        status: "failed",
        errorCode: ErrorCode.EXPORT_FAILED,
        message,
      });
      return {
        ok: false,
        status: "failed",
        jobId,
        exportId,
        generationId,
        errorCode: ErrorCode.EXPORT_FAILED,
        message,
      };
    }

    const failureCode = terminalJob?.failureCode ?? ErrorCode.EXPORT_FAILED;
    const failureMessage =
      terminalJob?.failureMessage ??
      exportRecord?.failureReason ??
      "Export preparation did not complete.";

    markPreparingExportFailed(failureMessage);

    logEvent("export_inline_execution_failed", {
      generationId,
      exportId,
      jobId,
      status: "failed",
      errorCode: failureCode,
      message: failureMessage,
    });

    return {
      ok: false,
      status: "failed",
      jobId,
      exportId,
      generationId,
      errorCode: failureCode,
      message: failureMessage,
    };
  } catch (error) {
    const exportRecord = readExportRecord();
    const message =
      exportRecord?.failureReason ??
      (error instanceof Error ? error.message : "Export preparation failed.");

    markPreparingExportFailed(message);

    logError("export_inline_execution_failed", error, {
      generationId,
      exportId,
      jobId,
      status: "failed",
      errorCode: ErrorCode.EXPORT_FAILED,
      message,
    });

    return {
      ok: false,
      status: "failed",
      jobId,
      exportId,
      generationId,
      errorCode: ErrorCode.EXPORT_FAILED,
      message,
    };
  }
}
