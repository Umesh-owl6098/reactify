import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CancelGenerationResponseSchema,
  ConfirmPlanRequestSchema,
  ConfirmPlanResponseSchema,
  CreateGenerationRequestSchema,
  CreateGenerationResponseSchema,
  GenerationPlanV1Schema,
  GenerationStatusResponseSchema,
} from "@reactify/generation-contracts";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import { validatePlanDependencies } from "../lib/allowlist.js";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { PipelineRunner, GenerationStore } from "../pipeline/index.js";

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
): Promise<void> {
  app.post("/api/v1/generations", async (request, reply) => {
    const parsed = CreateGenerationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INTERNAL_ERROR, "Invalid generation request body.");
    }

    const image = await imageStorage.get(parsed.data.imageId);
    if (!image) {
      return sendError(reply, request, 404, ErrorCode.IMAGE_NOT_FOUND, "Uploaded image was not found.");
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
}
