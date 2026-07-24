import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CancelGenerationResponseSchema,
  ConfirmPlanRequestSchema,
  ConfirmPlanResponseSchema,
  CreateGenerationRequestSchema,
  CreateGenerationResponseSchema,
  DeleteGenerationResponseSchema,
  GeneratedFileContentResponseSchema,
  GeneratedFileListResponseSchema,
  GenerationListResponseSchema,
  GenerationPlanV1Schema,
  GenerationStatusResponseSchema,
  SandboxValidationResponseSchema,
} from "@reactify/generation-contracts";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import { getGeneratedProjectFile, toGeneratedProjectSummary } from "../lib/generatedProjectResponse.js";
import { validateSandboxValidationReport } from "../lib/sandboxValidationReport.js";
import { validateProjectFilePath } from "../lib/validation/filePathValidator.js";
import { validatePlanDependencies } from "../lib/allowlist.js";
import { ensureImagePersisted } from "../lib/imagePersistence.js";
import { sendPersistenceError } from "../lib/persistenceRouteErrors.js";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { PersistenceService } from "../persistence/PersistenceService.js";
import type { PipelineRunner, GenerationStore } from "../pipeline/index.js";

const MAX_FILE_CONTENT_BYTES = 512 * 1024;

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: APIErrorBody["error"]["code"],
  message: string,
  fieldErrors?: Record<string, string>,
): FastifyReply {
  const body: APIErrorBody = {
    error: {
      code,
      message,
      requestId: request.id || randomUUID(),
      fieldErrors,
    },
  };

  return reply.status(statusCode).send(body);
}

export async function registerGenerationRoutes(
  app: FastifyInstance,
  imageStorage: ImageStorage,
  store: GenerationStore,
  runner: PipelineRunner,
  persistence?: PersistenceService,
): Promise<void> {
  const MAX_LIST_LIMIT = 100;

  app.get("/api/v1/generations", async (request, reply) => {
    if (!persistence) {
      return sendError(reply, request, 503, ErrorCode.DATABASE_UNAVAILABLE, "Generation listing requires database persistence.");
    }

    const query = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
      order?: "asc" | "desc";
    };

    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), MAX_LIST_LIMIT);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    try {
      const result = await persistence.generations.listSummaries({
        status: query.status,
        limit,
        offset,
        order: query.order,
      });
      const response = GenerationListResponseSchema.parse({
        total: result.total,
        limit,
        offset,
        items: result.items,
      });
      return reply.send(response);
    } catch (error) {
      return sendPersistenceError(reply, request, error);
    }
  });

  app.delete("/api/v1/generations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!persistence) {
      return sendError(reply, request, 503, ErrorCode.DATABASE_UNAVAILABLE, "Generation deletion requires database persistence.");
    }

    const record = store.getIncludingDeleted(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    if (record.deletedAt) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    try {
      const deleted = store.softDelete(id);
      if (!deleted) {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }

      await persistence.generations.softDelete(id);
      const response = DeleteGenerationResponseSchema.parse({
        generationId: id,
        deletedAt: record.deletedAt,
      });
      return reply.send(response);
    } catch (error) {
      return sendPersistenceError(reply, request, error);
    }
  });

  app.post("/api/v1/generations", async (request, reply) => {
    const parsed = CreateGenerationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INTERNAL_ERROR, "Invalid generation request body.");
    }

    const image = await imageStorage.get(parsed.data.imageId);
    if (!image) {
      return sendError(reply, request, 404, ErrorCode.IMAGE_NOT_FOUND, "Uploaded image was not found.");
    }

    if (persistence) {
      try {
        await ensureImagePersisted(parsed.data.imageId, imageStorage, persistence.images);
      } catch (error) {
        return sendPersistenceError(reply, request, error);
      }
    }

    const generationId = runner.start({
      imageId: parsed.data.imageId,
      projectId: parsed.data.projectId,
    });

    const response = CreateGenerationResponseSchema.parse({ generationId });
    return reply.status(202).send(response);
  });

  app.get("/api/v1/generations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);

    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const snapshot = store.toSnapshot(record);
    const response = GenerationStatusResponseSchema.parse(snapshot);
    return reply.send(response);
  });

  app.post("/api/v1/generations/:id/confirm-plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);

    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    if (!record.awaitingPlanConfirmation) {
      if (record.confirmedAt) {
        const response = ConfirmPlanResponseSchema.parse({ status: record.status });
        return reply.send(response);
      }

      return sendError(
        reply,
        request,
        409,
        ErrorCode.INVALID_GENERATION_STATE,
        "Generation is not awaiting plan confirmation.",
      );
    }

    const parsed = ConfirmPlanRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.PLAN_SCHEMA_INVALID, "Invalid plan request body.");
    }

    const dependencyResult = validatePlanDependencies(parsed.data.plan);
    if (!dependencyResult.ok) {
      return sendError(
        reply,
        request,
        422,
        ErrorCode.UNSAFE_DEPENDENCY,
        `Dependency "${dependencyResult.dependency}" is not allowlisted.`,
      );
    }

    const originalPlan = record.outputs.generationPlan;
    const editedByUser =
      originalPlan !== null &&
      JSON.stringify(originalPlan) !== JSON.stringify(parsed.data.plan);

    const confirmResult = runner.confirmPlan(id, parsed.data.plan, editedByUser);
    if (!confirmResult.ok) {
      if (confirmResult.reason === "schema_invalid") {
        const validation = GenerationPlanV1Schema.safeParse(parsed.data.plan);
        const fieldErrors = validation.success
          ? undefined
          : Object.fromEntries(
              validation.error.issues.map((issue) => [issue.path.join("."), issue.message]),
            );
        return sendError(
          reply,
          request,
          422,
          ErrorCode.PLAN_SCHEMA_INVALID,
          "Submitted plan failed schema validation.",
          fieldErrors,
        );
      }

      if (confirmResult.reason === "unsafe_dependency") {
        return sendError(reply, request, 422, ErrorCode.UNSAFE_DEPENDENCY, "Plan contains unsafe dependencies.");
      }

      return sendError(
        reply,
        request,
        409,
        ErrorCode.INVALID_GENERATION_STATE,
        "Generation is not awaiting plan confirmation.",
      );
    }

    const updated = store.get(id);
    const response = ConfirmPlanResponseSchema.parse({
      status: updated?.status ?? "Generating",
    });
    return reply.send(response);
  });

  app.post("/api/v1/generations/:id/sandbox-validation", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);

    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const validation = validateSandboxValidationReport(request.body, id);
    if (!validation.ok) {
      return sendError(
        reply,
        request,
        validation.errorCode === ErrorCode.REPORT_TOO_LARGE ? 413 : 422,
        validation.errorCode,
        validation.message,
      );
    }

    const submitResult = await runner.submitSandboxValidation(id, validation.report.request);
    if (!submitResult.ok) {
      switch (submitResult.reason) {
        case "not_found":
          return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
        case "invalid_state":
          return sendError(
            reply,
            request,
            409,
            ErrorCode.INVALID_GENERATION_STATE,
            "Generation is not awaiting sandbox validation.",
          );
        case "hash_mismatch":
          return sendError(
            reply,
            request,
            422,
            ErrorCode.SANDBOX_REPORT_INVALID,
            "Sandbox validation report project hash does not match the generated project.",
          );
        case "duplicate_conflict":
          return sendError(
            reply,
            request,
            409,
            ErrorCode.INVALID_GENERATION_STATE,
            "A conflicting sandbox validation report was already submitted.",
          );
        case "invalid_report":
          return sendError(
            reply,
            request,
            422,
            ErrorCode.SANDBOX_REPORT_INVALID,
            "Sandbox validation report failed schema validation.",
          );
        case "too_large":
          return sendError(reply, request, 413, ErrorCode.REPORT_TOO_LARGE, "Sandbox validation report is too large.");
        default:
          return sendError(reply, request, 500, ErrorCode.INTERNAL_ERROR, "Failed to submit sandbox validation.");
      }
    }

    const updated = store.get(id);
    const response = SandboxValidationResponseSchema.parse({
      status: updated?.status ?? "Repairing",
    });
    return reply.send(response);
  });

  app.post("/api/v1/generations/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);

    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const cancelled = runner.cancel(id);
    if (!cancelled) {
      return sendError(
        reply,
        request,
        409,
        ErrorCode.INVALID_GENERATION_STATE,
        "Generation cannot be cancelled in its current state.",
      );
    }

    const response = CancelGenerationResponseSchema.parse({ status: "Cancelled" });
    return reply.send(response);
  });

  app.get("/api/v1/generations/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);

    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    if (!record.outputs.generatedProject) {
      return sendError(
        reply,
        request,
        404,
        ErrorCode.GENERATION_NOT_FOUND,
        "Generated project files are not available yet.",
      );
    }

    const response = GeneratedFileListResponseSchema.parse({
      generationId: id,
      files: toGeneratedProjectSummary(record.outputs.generatedProject).files,
    });

    return reply.send(response);
  });

  app.get("/api/v1/generations/:id/files/content", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path: requestedPath } = request.query as { path?: string };
    const record = store.get(id);

    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    if (!record.outputs.generatedProject) {
      return sendError(
        reply,
        request,
        404,
        ErrorCode.GENERATION_NOT_FOUND,
        "Generated project files are not available yet.",
      );
    }

    if (!requestedPath) {
      return sendError(reply, request, 422, ErrorCode.UNSAFE_FILE_PATH, "File path query parameter is required.");
    }

    const pathResult = validateProjectFilePath(requestedPath);
    if (!pathResult.ok) {
      return sendError(reply, request, 422, ErrorCode.UNSAFE_FILE_PATH, pathResult.message);
    }

    const file = getGeneratedProjectFile(record.outputs.generatedProject, pathResult.normalizedPath);
    if (!file) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generated file was not found.");
    }

    if (Buffer.byteLength(file.content, "utf8") > MAX_FILE_CONTENT_BYTES) {
      return sendError(
        reply,
        request,
        422,
        ErrorCode.INTERNAL_ERROR,
        "Generated file exceeds the maximum response size.",
      );
    }

    const response = GeneratedFileContentResponseSchema.parse({
      path: file.path,
      language: file.language,
      content: file.content,
    });

    return reply.send(response);
  });
}
