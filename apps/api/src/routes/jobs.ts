import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ErrorCode, JobListResponseSchema, type APIErrorBody } from "@reactify/shared";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { requireAuth } from "../auth/middleware.js";
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

export async function registerJobRoutes(
  app: FastifyInstance,
  jobService: JobService,
  authorization: AuthorizationService,
): Promise<void> {
  app.get("/api/v1/jobs/:jobId", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const { jobId } = request.params as { jobId: string };
    const status = await jobService.getOwnedJobStatus(jobId, request.auth.user.id);
    if (!status) {
      return sendError(reply, request, 404, ErrorCode.JOB_NOT_FOUND, "Job not found.");
    }

    return reply.send(status);
  });

  app.get("/api/v1/generations/:generationId/jobs", async (request, reply) => {
    const { generationId } = request.params as { generationId: string };

    if (!requireAuth(request, reply)) {
      return;
    }

    const record = requireOwnedGeneration(authorization, request, reply, generationId, sendError);
    if (!record) {
      return;
    }

    const query = request.query as {
      status?: string;
      jobType?: string;
      limit?: string;
      offset?: string;
      order?: "asc" | "desc";
    };

    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    const response = await jobService.listGenerationJobs({
      generationId,
      ownerId: request.auth.user.id,
      status: query.status,
      jobType: query.jobType,
      limit,
      offset,
      order: query.order ?? "desc",
    });

    return reply.send(JobListResponseSchema.parse(response));
  });

  app.post("/api/v1/jobs/:jobId/cancel", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const { jobId } = request.params as { jobId: string };
    const job = await jobService.repository.getOwnedJob(jobId, request.auth.user.id);
    if (!job) {
      return sendError(reply, request, 404, ErrorCode.JOB_NOT_FOUND, "Job not found.");
    }

    requireOwnedGeneration(authorization, request, reply, job.generationId, sendError);

    const result = await jobService.cancelJob(jobId, request.auth.user.id);
    if (!result.ok) {
      return sendError(reply, request, 409, result.code, "Job cannot be cancelled.");
    }

    return reply.send(result.job);
  });

  app.post("/api/v1/jobs/:jobId/retry", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const { jobId } = request.params as { jobId: string };
    const job = await jobService.repository.getOwnedJob(jobId, request.auth.user.id);
    if (!job) {
      return sendError(reply, request, 404, ErrorCode.JOB_NOT_FOUND, "Job not found.");
    }

    requireOwnedGeneration(authorization, request, reply, job.generationId, sendError);

    const result = await jobService.retryJob(jobId, request.auth.user.id);
    if (!result.ok) {
      return sendError(reply, request, 409, result.code as (typeof ErrorCode)[keyof typeof ErrorCode], "Job cannot be retried.");
    }

    return reply.status(202).send(result.job);
  });
}
