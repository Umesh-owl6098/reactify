import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ExportDetailResponseSchema,
  ExportHistoryListResponseSchema,
  ExportRequestSchema,
  ExportSummarySchema,
} from "@reactify/generation-contracts";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import { ExportService } from "../lib/export/ExportService.js";
import { getActiveProjectVersion } from "../lib/export/exportEligibility.js";
import type { GenerationStore } from "../pipeline/store.js";

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
): Promise<void> {
  app.post("/api/v1/generations/:id/exports", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const parsed = ExportRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INTERNAL_ERROR, "Invalid export request body.");
    }

    const idempotencyKey = request.headers["idempotency-key"];
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
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const response = ExportHistoryListResponseSchema.parse({
      generationId: id,
      exports: exportService.listSummaries(record),
    });
    return reply.send(response);
  });

  app.get("/api/v1/generations/:id/exports/:exportId", async (request, reply) => {
    const { id, exportId } = request.params as { id: string; exportId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
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
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
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
