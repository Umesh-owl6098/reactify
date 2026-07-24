import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateGenerationRequestSchema,
  CreateGenerationResponseSchema,
  GenerationStatusResponseSchema,
} from "@reactify/generation-contracts";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { PipelineRunner, GenerationStore } from "../pipeline/index.js";

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: APIErrorBody["error"]["code"],
  message: string,
): FastifyReply {
  const body: APIErrorBody = {
    error: {
      code,
      message,
      requestId: request.id || randomUUID(),
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
}
