import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ErrorCode,
  ImageUploadResponseSchema,
  type APIErrorBody,
  type ImageUploadResponse,
} from "@reactify/shared";
import type { Env } from "../env.js";
import { ImageStorage } from "../lib/imageStorage.js";
import { persistUploadedImage } from "../lib/imagePersistence.js";
import type { PersistenceService } from "../persistence/PersistenceService.js";
import { validateImageBuffer } from "../lib/imageValidator.js";

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

export async function registerImageRoutes(
  app: FastifyInstance,
  env: Env,
  storage: ImageStorage,
  persistence?: PersistenceService,
): Promise<void> {
  app.post("/api/v1/images", async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return sendError(
        reply,
        request,
        422,
        ErrorCode.UNSUPPORTED_IMAGE,
        'Missing "image" file in multipart form data.',
      );
    }

    if (file.fieldname !== "image") {
      return sendError(
        reply,
        request,
        422,
        ErrorCode.UNSUPPORTED_IMAGE,
        'Expected multipart field name "image".',
      );
    }

    const buffer = await file.toBuffer();
    const validation = validateImageBuffer(buffer, env.IMAGE_MAX_BYTES);

    if (!validation.ok) {
      const statusCode =
        validation.errorCode === ErrorCode.FILE_TOO_LARGE ||
        validation.errorCode === ErrorCode.INVALID_MIME_TYPE ||
        validation.errorCode === ErrorCode.CORRUPTED_IMAGE ||
        validation.errorCode === ErrorCode.UNSUPPORTED_IMAGE
          ? 422
          : 422;

      return sendError(reply, request, statusCode, validation.errorCode, validation.message);
    }

    const stored = await storage.save(buffer, validation.mimeType, file.filename);
    if (persistence) {
      await persistUploadedImage(stored, persistence.images, file.filename);
    }
    const response: ImageUploadResponse = ImageUploadResponseSchema.parse({
      imageId: stored.imageId,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      previewUrl: `/api/v1/images/${stored.imageId}`,
    });

    return reply.status(201).send(response);
  });

  app.get("/api/v1/images/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const image = await storage.get(id);

    if (!image) {
      return sendError(reply, request, 404, ErrorCode.IMAGE_NOT_FOUND, "Image not found.");
    }

    return reply.type(image.mimeType).send(image.buffer);
  });
}
