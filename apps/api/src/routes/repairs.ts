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
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { requireOwnedGeneration } from "../lib/generationAccess.js";
import type { JobService } from "../jobs/job-service.js";
import { JobAcceptedResponseSchema } from "@reactify/shared";

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
  authorization: AuthorizationService,
  jobService?: JobService,
): Promise<void> {
  app.get("/api/v1/generations/:id/repairs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
    }

    const response = RepairHistoryListResponseSchema.parse({
      generationId: id,
      attempts: summarizeRepairAttempts(record.repairAttempts),
    });
    return reply.send(response);
  });

  app.get("/api/v1/generations/:id/repairs/:attemptNumber", async (request, reply) => {
    const { id, attemptNumber } = request.params as { id: string; attemptNumber: string };
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
    }

    const result = store.requestManualRetry(id);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }
      return sendError(reply, request, 409, ErrorCode.INVALID_GENERATION_STATE, "Manual repair retry is not allowed.");
    }

    if (jobService) {
      const accepted = await jobService.enqueue({
        generationId: id,
        ownerId: request.auth!.user.id,
        jobType: "automatic_repair",
        payload: { generationId: id },
        idempotencyKey: `manual-repair-${id}-${Date.now()}`,
      });
      const updatedRecord = store.get(id);
      return reply.status(202).send({
        status: updatedRecord?.repairStatus ?? "analyzing",
        job: JobAcceptedResponseSchema.parse(accepted.job),
      });
    }

    await runner.resumeFromSandbox(id);
    const updatedRecord = store.get(id);
    const response = RepairRetryResponseSchema.parse({ status: updatedRecord?.repairStatus ?? "analyzing" });
    return reply.send(response);
  });
}
