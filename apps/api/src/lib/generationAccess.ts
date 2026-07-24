import type { FastifyReply, FastifyRequest } from "fastify";
import { ErrorCode } from "@reactify/shared";
import { requireAuth } from "../auth/middleware.js";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import type { GenerationRecord } from "../pipeline/types.js";

type SendErrorFn = (
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string,
) => FastifyReply;

export function requireOwnedGeneration(
  authorization: AuthorizationService,
  request: FastifyRequest,
  reply: FastifyReply,
  generationId: string,
  sendError: SendErrorFn,
): GenerationRecord | null {
  if (!requireAuth(request, reply)) {
    return null;
  }

  const record = authorization.getOwnedGeneration(request.auth.user.id, generationId);
  if (!record) {
    sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    return null;
  }

  return record;
}

export async function requireOwnedImage(
  authorization: AuthorizationService,
  request: FastifyRequest,
  reply: FastifyReply,
  imageId: string,
  sendError: SendErrorFn,
): Promise<boolean> {
  if (!requireAuth(request, reply)) {
    return false;
  }

  const ownsImage = await authorization.userOwnsImage(request.auth.user.id, imageId);
  if (!ownsImage) {
    sendError(reply, request, 404, ErrorCode.IMAGE_NOT_FOUND, "Image not found.");
    return false;
  }

  return true;
}
