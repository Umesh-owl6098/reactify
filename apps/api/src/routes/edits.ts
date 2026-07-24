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
import { ErrorCode, JobAcceptedResponseSchema, type APIErrorBody } from "@reactify/shared";
import type { EditService } from "../lib/edit/EditService.js";
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

export async function registerEditRoutes(
  app: FastifyInstance,
  store: GenerationStore,
  editService: EditService,
  authorization: AuthorizationService,
  jobService?: JobService,
): Promise<void> {
  app.post("/api/v1/generations/:id/edits", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
    }

    const parsed = NaturalLanguageEditRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INVALID_EDIT_INSTRUCTION, "Invalid edit request body.");
    }

    const idempotencyKey = request.headers["idempotency-key"];

    if (jobService) {
      const prepared = editService.prepareEdit(
        record,
        parsed.data,
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );

      if (!prepared.ok) {
        return sendError(reply, request, prepared.statusCode, prepared.errorCode, prepared.message);
      }

      if (prepared.duplicate) {
        return reply.status(200).send(EditOperationSummarySchema.parse(prepared.summary));
      }

      const accepted = await jobService.enqueue({
        generationId: id,
        ownerId: request.auth!.user.id,
        jobType: "edit_intent_analysis",
        payload: { generationId: id, editId: prepared.summary.editId },
        idempotencyKey:
          typeof idempotencyKey === "string"
            ? `${idempotencyKey}-intent`
            : `edit-intent-${prepared.summary.editId}`,
      });

      void store.persist(record);
      return reply.status(202).send({
        edit: EditOperationSummarySchema.parse(prepared.summary),
        job: JobAcceptedResponseSchema.parse(accepted.job),
      });
    }

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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
  authorization: AuthorizationService,
): Promise<void> {
  app.get("/api/v1/generations/:id/versions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
