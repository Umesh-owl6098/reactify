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
import type { ImageRepository } from "../persistence/repositories/ImageRepository.js";
import { PersistenceError } from "../persistence/errors.js";
import { validateImageBuffer } from "../lib/imageValidator.js";
import { requireAuth } from "../auth/middleware.js";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { requireOwnedImage } from "../lib/generationAccess.js";

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

interface UploadLogContext {
  request: FastifyRequest;
  stage: string;
  ownerId?: string;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  imageId?: string;
  validationResult?: string;
  errorCode?: string;
}

function logUploadStage(app: FastifyInstance, context: UploadLogContext): void {
  app.log.info({
    event: "image_upload_stage",
    requestId: context.request.id,
    stage: context.stage,
    ownerId: context.ownerId,
    originalFilename: context.originalFilename,
    mimeType: context.mimeType,
    sizeBytes: context.sizeBytes,
    imageId: context.imageId,
    validationResult: context.validationResult,
    errorCode: context.errorCode,
  });
}

export async function registerImageRoutes(
  app: FastifyInstance,
  env: Env,
  storage: ImageStorage,
  authorization: AuthorizationService,
  images: ImageRepository,
): Promise<void> {
  app.post("/api/v1/images", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      logUploadStage(app, { request, stage: "auth_required" });
      return;
    }

    const ownerId = request.auth.user.id;
    logUploadStage(app, { request, stage: "received", ownerId });

    let file;
    try {
      file = await request.file();
    } catch {
      logUploadStage(app, {
        request,
        stage: "multipart_parse_failed",
        ownerId,
        errorCode: ErrorCode.UNSUPPORTED_IMAGE,
      });
      return sendError(
        reply,
        request,
        422,
        ErrorCode.UNSUPPORTED_IMAGE,
        "Could not read uploaded image data.",
      );
    }

    if (!file) {
      logUploadStage(app, { request, stage: "missing_file", ownerId });
      return sendError(
        reply,
        request,
        422,
        ErrorCode.UNSUPPORTED_IMAGE,
        'Missing "image" file in multipart form data.',
      );
    }

    if (file.fieldname !== "image") {
      logUploadStage(app, {
        request,
        stage: "invalid_field_name",
        ownerId,
        originalFilename: file.filename,
      });
      return sendError(
        reply,
        request,
        422,
        ErrorCode.UNSUPPORTED_IMAGE,
        'Expected multipart field name "image".',
      );
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      logUploadStage(app, {
        request,
        stage: "file_read_failed",
        ownerId,
        originalFilename: file.filename,
      });
      return sendError(
        reply,
        request,
        422,
        ErrorCode.FILE_TOO_LARGE,
        `File exceeds the maximum allowed size of ${Math.floor(env.IMAGE_MAX_BYTES / (1024 * 1024))} MB.`,
      );
    }

    logUploadStage(app, {
      request,
      stage: "validating",
      ownerId,
      originalFilename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: buffer.length,
    });

    const validation = validateImageBuffer(buffer, env.IMAGE_MAX_BYTES);

    if (!validation.ok) {
      logUploadStage(app, {
        request,
        stage: "validation_failed",
        ownerId,
        originalFilename: file.filename,
        sizeBytes: buffer.length,
        validationResult: validation.errorCode,
        errorCode: validation.errorCode,
      });
      return sendError(reply, request, 422, validation.errorCode, validation.message);
    }

    let stored;
    try {
      stored = await storage.save(buffer, validation.mimeType, file.filename, ownerId);
    } catch {
      logUploadStage(app, {
        request,
        stage: "storage_failed",
        ownerId,
        originalFilename: file.filename,
        sizeBytes: buffer.length,
        errorCode: ErrorCode.DATABASE_UNAVAILABLE,
      });
      return sendError(
        reply,
        request,
        500,
        ErrorCode.DATABASE_UNAVAILABLE,
        "Image storage is unavailable. Please try again.",
      );
    }

    logUploadStage(app, {
      request,
      stage: "stored",
      ownerId,
      originalFilename: file.filename,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      imageId: stored.imageId,
    });

    try {
      await persistUploadedImage(stored, ownerId, images, file.filename);
    } catch (error) {
      await storage.delete(stored.imageId).catch(() => undefined);
      const code =
        error instanceof PersistenceError ? error.code : ErrorCode.DATABASE_QUERY_FAILED;
      const message =
        error instanceof PersistenceError
          ? error.message
          : "Could not save uploaded image metadata.";
      logUploadStage(app, {
        request,
        stage: "metadata_persist_failed",
        ownerId,
        originalFilename: file.filename,
        imageId: stored.imageId,
        errorCode: code,
      });
      return sendError(reply, request, 500, code, message);
    }

    const response: ImageUploadResponse = ImageUploadResponseSchema.parse({
      imageId: stored.imageId,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      previewUrl: `/api/v1/images/${stored.imageId}`,
    });

    logUploadStage(app, {
      request,
      stage: "completed",
      ownerId,
      imageId: stored.imageId,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    });

    return reply.status(201).send(response);
  });

  app.get("/api/v1/images/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await requireOwnedImage(authorization, request, reply, id, sendError))) {
      return;
    }

    const image = await storage.get(id);

    if (!image) {
      return sendError(reply, request, 404, ErrorCode.IMAGE_NOT_FOUND, "Image not found.");
    }

    return reply.type(image.mimeType).send(image.buffer);
  });
}
