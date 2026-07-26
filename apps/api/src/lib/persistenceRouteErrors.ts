import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import { PersistenceError } from "../persistence/errors.js";

export function sendPersistenceError(
  reply: FastifyReply,
  request: FastifyRequest,
  error: unknown,
): FastifyReply {
  if (error instanceof PersistenceError) {
    const statusCode =
      error.code === ErrorCode.CONCURRENT_MODIFICATION
        ? 409
        : error.code === ErrorCode.ARTIFACT_NOT_FOUND
          ? 404
          : error.code === ErrorCode.PERSISTED_DATA_INVALID ||
              error.code === ErrorCode.PROJECT_VERSION_CORRUPTED
            ? 422
            : error.code === ErrorCode.DATABASE_UNAVAILABLE ||
                error.code === ErrorCode.DATABASE_SCHEMA_MISSING
              ? 503
              : 500;

    const body: APIErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        requestId: request.id || randomUUID(),
      },
    };
    return reply.status(statusCode).send(body);
  }

  const body: APIErrorBody = {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "An unexpected error occurred.",
      requestId: request.id || randomUUID(),
    },
  };
  return reply.status(500).send(body);
}
