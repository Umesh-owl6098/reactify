import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  EditClarificationRequestSchema,
  EditConfirmationRequestSchema,
  EditDetailResponseSchema,
  EditHistoryListResponseSchema,
  EditOperationSummarySchema,
  NaturalLanguageEditRequestSchema,
} from "@reactify/generation-contracts";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import type { EditService } from "../lib/edit/EditService.js";
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

export async function registerEditRoutes(
  app: FastifyInstance,
  store: GenerationStore,
  editService: EditService,
): Promise<void> {
  app.post("/api/v1/generations/:id/edits", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const parsed = NaturalLanguageEditRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INVALID_EDIT_INSTRUCTION, "Invalid edit request body.");
    }

    const idempotencyKey = request.headers["idempotency-key"];
    const result = await editService.createEdit(
      record,
      parsed.data,
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );

    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.status(result.duplicate ? 200 : 201).send(EditOperationSummarySchema.parse(result.summary));
  });

  app.get("/api/v1/generations/:id/edits", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    return reply.send(
      EditHistoryListResponseSchema.parse({
        generationId: id,
        edits: editService.listSummaries(record),
      }),
    );
  });

  app.get("/api/v1/generations/:id/edits/:editId", async (request, reply) => {
    const { id, editId } = request.params as { id: string; editId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const edit = editService.getEdit(record, editId);
    if (!edit) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Edit not found.");
    }

    return reply.send(
      EditDetailResponseSchema.parse({
        generationId: id,
        edit: EditOperationSummarySchema.parse(edit),
      }),
    );
  });

  app.post("/api/v1/generations/:id/edits/:editId/clarification", async (request, reply) => {
    const { id, editId } = request.params as { id: string; editId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const parsed = EditClarificationRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INVALID_EDIT_INSTRUCTION, "Invalid clarification request body.");
    }

    const result = await editService.submitClarification(record, editId, parsed.data);
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.send(EditOperationSummarySchema.parse(result.summary));
  });

  app.post("/api/v1/generations/:id/edits/:editId/confirm", async (request, reply) => {
    const { id, editId } = request.params as { id: string; editId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const parsed = EditConfirmationRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INVALID_EDIT_INSTRUCTION, "Invalid confirmation request body.");
    }

    const result = await editService.confirmEdit(record, editId, parsed.data);
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.send(EditOperationSummarySchema.parse(result.summary));
  });

  app.post("/api/v1/generations/:id/edits/:editId/cancel", async (request, reply) => {
    const { id, editId } = request.params as { id: string; editId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const result = editService.cancelEdit(record, editId);
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.send(EditOperationSummarySchema.parse(result.summary));
  });
}

export async function registerVersionRoutes(
  app: FastifyInstance,
  store: GenerationStore,
  editService: EditService,
): Promise<void> {
  app.get("/api/v1/generations/:id/versions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    return reply.send({
      generationId: id,
      activeVersionId: record.activeVersionId,
      versions: record.versions.map((version) => ({
        versionId: version.versionId,
        versionNumber: version.versionNumber,
        source: version.source,
        label: version.label,
        parentVersionId: version.parentVersionId,
        projectHash: version.projectHash,
        changedFiles: version.changedFiles,
        editId: version.editId,
        instruction: version.instruction,
        createdAt: version.createdAt,
        isActive: version.versionId === record.activeVersionId,
      })),
    });
  });

  app.post("/api/v1/generations/:id/versions/:versionId/rollback", async (request, reply) => {
    const { id, versionId } = request.params as { id: string; versionId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const expectedProjectHash = (request.body as { expectedProjectHash?: string } | undefined)?.expectedProjectHash;
    if (!expectedProjectHash) {
      return sendError(reply, request, 422, ErrorCode.STALE_PROJECT_HASH, "expectedProjectHash is required.");
    }

    const result = await editService.rollbackToVersion(record, versionId, expectedProjectHash);
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.send({
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      projectHash: result.projectHash,
      source: "rollback",
    });
  });
}
