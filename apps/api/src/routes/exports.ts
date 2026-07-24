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
import { getActiveProjectVersion } from "../lib/export/exportEligibility.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { requireOwnedGeneration } from "../lib/generationAccess.js";
import type { JobService } from "../jobs/job-service.js";

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
): Promise<void> {
  app.post("/api/v1/generations/:id/exports", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
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
      });

      void store.persist(record);
      return reply.status(202).send({
        export: ExportSummarySchema.parse(initiated.summary),
        job: JobAcceptedResponseSchema.parse(accepted.job),
      });
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
    }

    const exportRecord = exportService.getExport(record, exportId);
    if (!exportRecord || exportRecord.status !== "ready" || !exportRecord.zipBuffer) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Export download is not available.");
    }

    const activeVersion = getActiveProjectVersion(record);
    if (!activeVersion || exportRecord.versionId !== activeVersion.versionId) {
      return sendError(reply, request, 409, ErrorCode.INVALID_GENERATION_STATE, "Export belongs to a stale project version.");
    }

    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${exportRecord.filename}"`)
      .header("Content-Length", exportRecord.zipBuffer.byteLength)
      .header("Cache-Control", "no-store")
      .send(exportRecord.zipBuffer);
  });
}
