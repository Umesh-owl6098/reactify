import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  RepairAttemptDetailResponseSchema,
  RepairHistoryListResponseSchema,
  RepairRetryResponseSchema,
} from "@reactify/generation-contracts";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import { summarizeRepairAttempts } from "../lib/repair/repairSnapshot.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { PipelineRunner } from "../pipeline/PipelineRunner.js";

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

function sanitizeAttempt(attempt: import("../pipeline/types.js").InternalRepairAttemptRecord) {
  const { patchFingerprint: _patchFingerprint, diagnosticsFingerprint: _diagnosticsFingerprint, ...safe } =
    attempt;
  return safe;
}

export async function registerRepairRoutes(
  app: FastifyInstance,
  store: GenerationStore,
  runner: PipelineRunner,
): Promise<void> {
  app.get("/api/v1/generations/:id/repairs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const response = RepairHistoryListResponseSchema.parse({
      generationId: id,
      attempts: summarizeRepairAttempts(record.repairAttempts),
    });
    return reply.send(response);
  });

  app.get("/api/v1/generations/:id/repairs/:attemptNumber", async (request, reply) => {
    const { id, attemptNumber } = request.params as { id: string; attemptNumber: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const attempt = record.repairAttempts.find((item) => item.attemptNumber === Number(attemptNumber));
    if (!attempt) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Repair attempt not found.");
    }

    const response = RepairAttemptDetailResponseSchema.parse({
      generationId: id,
      attempt: sanitizeAttempt(attempt),
    });
    return reply.send(response);
  });

  app.post("/api/v1/generations/:id/repairs/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = store.requestManualRetry(id);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }
      return sendError(reply, request, 409, ErrorCode.INVALID_GENERATION_STATE, "Manual repair retry is not allowed.");
    }

    await runner.resumeFromSandbox(id);
    const record = store.get(id);
    const response = RepairRetryResponseSchema.parse({ status: record?.repairStatus ?? "analyzing" });
    return reply.send(response);
  });
}
