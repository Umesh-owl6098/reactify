import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ExportDetailResponseSchema,
  ExportHistoryListResponseSchema,
  ExportRequestSchema,
  ExportSummarySchema,
} from "@reactify/generation-contracts";
import { ErrorCode, JobAcceptedResponseSchema, type APIErrorBody } from "@reactify/shared";
import { ExportService } from "../lib/export/ExportService.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { requireOwnedGeneration } from "../lib/generationAccess.js";
import { hydrateOwnedGenerationRecord } from "../lib/hydrateGenerationRecord.js";
import type { JobRunner } from "../jobs/job-runner.js";
import type { JobService } from "../jobs/job-service.js";
import type { PersistenceService } from "../persistence/PersistenceService.js";
import { runInlineExportPreparation } from "../lib/export/runInlineExportPreparation.js";
import { logError, logEvent } from "../lib/structured-log.js";

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: APIErrorBody["error"]["code"],
  message: string,
): FastifyReply {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
      requestId: request.id || randomUUID(),
    },
  });
}

export async function registerExportRoutes(
  app: FastifyInstance,
  store: GenerationStore,
  exportService: ExportService,
  authorization: AuthorizationService,
  jobService?: JobService,
  persistence?: PersistenceService,
  options?: {
    inlineExecution?: boolean;
    jobRunner?: JobRunner;
  },
): Promise<void> {
  const inlineExecution = options?.inlineExecution ?? false;
  const jobRunner = options?.jobRunner;
  const refreshOwnedGeneration = async (
    request: FastifyRequest,
    reply: FastifyReply,
    generationId: string,
  ) => {
    const owned = requireOwnedGeneration(authorization, request, reply, generationId, sendError);
    if (!owned || !persistence) {
      return owned;
    }

    const refreshed = await hydrateOwnedGenerationRecord({
      store,
      persistence,
      generationId,
      ownerId: request.auth!.user.id,
    });
    if (!refreshed) {
      sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      return null;
    }
    return refreshed;
  };

  app.post("/api/v1/generations/:id/exports", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await refreshOwnedGeneration(request, reply, id);
    if (!record) {
      return;
    }

    const parsed = ExportRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INTERNAL_ERROR, "Invalid export request body.");
    }

    const idempotencyKey = request.headers["idempotency-key"];

    if (jobService) {
      const initiated = exportService.initiateExport(
        record,
        parsed.data,
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );

      if (!initiated.ok) {
        return sendError(reply, request, initiated.statusCode, initiated.errorCode, initiated.message);
      }

      if (initiated.duplicate) {
        return reply.status(200).send(ExportSummarySchema.parse(initiated.summary));
      }

      logEvent("export_request_created", {
        generationId: id,
        exportId: initiated.exportId,
        versionId: initiated.summary.versionId,
        projectHash: initiated.summary.projectHash,
        ownerId: request.auth!.user.id,
      });

      // A separate worker hydrates the generation before running this job. The
      // pending export must therefore be durable before enqueueing; otherwise
      // a fast worker can observe a generation with no export record, fail the
      // job, and leave the browser polling a permanently "preparing" export.
      await store.persist(record);

      try {
        const runExportInline = inlineExecution && Boolean(jobRunner);
        const accepted = await jobService.enqueue({
          generationId: id,
          ownerId: request.auth!.user.id,
          jobType: "export_preparation",
          payload: {
            generationId: id,
            exportId: initiated.exportId!,
            versionId: initiated.summary.versionId,
            expectedProjectHash: initiated.summary.projectHash,
            projectName: parsed.data.projectName,
            includeMetadata: parsed.data.includeMetadata,
            includeGenerationSummary: parsed.data.includeGenerationSummary,
          },
          idempotencyKey:
            typeof idempotencyKey === "string"
              ? idempotencyKey
              : `export-${id}-${initiated.summary.versionId}-${initiated.summary.projectHash}`,
          skipInlineDispatch: runExportInline,
        });

        logEvent("export_job_enqueued", {
          generationId: id,
          exportId: initiated.exportId,
          jobId: accepted.job.jobId,
          versionId: initiated.summary.versionId,
          inlineExecution: runExportInline,
        });

        if (runExportInline && jobRunner) {
          const inlineResult = await runInlineExportPreparation({
            jobRunner,
            repository: jobService.repository,
            exportService,
            store,
            generationId: id,
            exportId: initiated.exportId!,
            jobId: accepted.job.jobId,
          });

          const currentRecord = store.get(id) ?? record;
          await store.persist(currentRecord);

          const exportSummary =
            exportService.listSummaries(currentRecord).find((entry) => entry.exportId === initiated.exportId!) ??
            ExportSummarySchema.parse(initiated.summary);

          if (!inlineResult.ok) {
            return sendError(
              reply,
              request,
              503,
              ErrorCode.EXPORT_FAILED,
              inlineResult.message,
            );
          }

          return reply.status(202).send({
            export: exportSummary,
            job: JobAcceptedResponseSchema.parse(accepted.job),
          });
        }

        return reply.status(202).send({
          export: ExportSummarySchema.parse(initiated.summary),
          job: JobAcceptedResponseSchema.parse(accepted.job),
        });
      } catch (error) {
        const pending = exportService.getExport(record, initiated.exportId!);
        if (pending) {
          pending.status = "failed";
          pending.failureReason = error instanceof Error ? error.message : "Export preparation could not be queued.";
          pending.completedAt = new Date().toISOString();
        }
        record.exportInProgress = false;
        await store.persist(record);
        logError("export_job_enqueue_failed", error, {
          generationId: id,
          exportId: initiated.exportId,
        });
        return sendError(
          reply,
          request,
          503,
          ErrorCode.EXPORT_FAILED,
          pending?.failureReason ?? "Export preparation could not be queued.",
        );
      }
    }

    const result = await exportService.createExport(
      record,
      parsed.data,
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      {
        info: (message, fields) => request.log.info({ ...fields, msg: message }),
        warn: (message, fields) => request.log.warn({ ...fields, msg: message }),
      },
    );

    if (!result.ok) {
      request.log.warn({
        msg: "export_create_rejected",
        generationId: id,
        errorCode: result.errorCode,
        statusCode: result.statusCode,
      });
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    const response = ExportSummarySchema.parse(result.summary);
    void store.persist(record);
    return reply.status(result.duplicate ? 200 : 201).send(response);
  });

  app.get("/api/v1/generations/:id/exports", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await refreshOwnedGeneration(request, reply, id);
    if (!record) {
      return;
    }

    const response = ExportHistoryListResponseSchema.parse({
      generationId: id,
      exports: exportService.listSummaries(record),
    });
    return reply.send(response);
  });

  app.get("/api/v1/generations/:id/exports/:exportId", async (request, reply) => {
    const { id, exportId } = request.params as { id: string; exportId: string };
    const record = await refreshOwnedGeneration(request, reply, id);
    if (!record) {
      return;
    }

    const exportRecord = exportService.getExport(record, exportId);
    if (!exportRecord) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Export not found.");
    }

    const response = ExportDetailResponseSchema.parse({
      generationId: id,
      export: ExportSummarySchema.parse(exportRecord),
    });
    return reply.send(response);
  });

  app.get("/api/v1/generations/:id/exports/:exportId/download", async (request, reply) => {
    const { id, exportId } = request.params as { id: string; exportId: string };
    const record = await refreshOwnedGeneration(request, reply, id);
    if (!record) {
      return;
    }

    const download = await exportService.resolveDownload(record, exportId);
    if (!download.ok) {
      return sendError(reply, request, download.statusCode, download.errorCode, download.message);
    }

    if (download.reconstructed) {
      void store.persist(record);
    }

    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${download.filename}"`)
      .header("Content-Length", download.buffer.byteLength)
      .header("Cache-Control", "no-store")
      .send(download.buffer);
  });
}
