import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
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
import { ErrorCode, JobAcceptedResponseSchema, type APIErrorBody } from "@reactify/shared";
import { getGeneratedProjectFile, toGeneratedProjectSummary } from "../lib/generatedProjectResponse.js";
import { validateSandboxValidationReport } from "../lib/sandboxValidationReport.js";
import { validateProjectFilePath } from "../lib/validation/filePathValidator.js";
import { validatePlanDependencies } from "../lib/allowlist.js";
import { ensureImagePersisted } from "../lib/imagePersistence.js";
import { sendPersistenceError } from "../lib/persistenceRouteErrors.js";
import { requireAuth } from "../auth/middleware.js";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { requireOwnedGeneration } from "../lib/generationAccess.js";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { ImageRepository } from "../persistence/repositories/ImageRepository.js";
import type { PersistenceService } from "../persistence/PersistenceService.js";
import type { PipelineRunner, GenerationStore } from "../pipeline/index.js";
import type { JobService } from "../jobs/job-service.js";
import { UsageLimitError } from "../jobs/job-service.js";
import { reconcileStaleGenerationState } from "../jobs/generation-stale-reconciliation.js";
import { reconcileGenerationLocks } from "../jobs/generation-lock-reconciliation.js";
import { recoverFailedGeneration } from "../jobs/generation-recovery.js";
import { PersistenceError } from "../persistence/errors.js";
import { verifySchemaReadiness } from "../persistence/schema-readiness.js";
import { logError, logEvent } from "../lib/structured-log.js";
import { hydrateOwnedGenerationRecord } from "../lib/hydrateGenerationRecord.js";
import { compileTailwindCss } from "../lib/styling/compileTailwindCss.js";
import { normalizeProjectStyling } from "../lib/styling/normalizeProjectStyling.js";

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
  authorization: AuthorizationService,
  images: ImageRepository,
  persistence?: PersistenceService,
  jobService?: JobService,
  prisma?: PrismaClient,
): Promise<void> {
  const MAX_LIST_LIMIT = 100;

  app.get("/api/v1/generations", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

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
        ownerId: request.auth!.user.id,
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

    if (!requireAuth(request, reply)) {
      return;
    }

    if (!persistence) {
      return sendError(reply, request, 503, ErrorCode.DATABASE_UNAVAILABLE, "Generation deletion requires database persistence.");
    }

    const record = authorization.getOwnedGeneration(request.auth.user.id, id);
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

      await persistence.generations.softDelete(id, request.auth.user.id);
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
    if (!requireAuth(request, reply)) {
      return;
    }

    const parsed = CreateGenerationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INTERNAL_ERROR, "Invalid generation request body.");
    }

    const image = await imageStorage.get(parsed.data.imageId);
    if (!image) {
      return sendError(reply, request, 404, ErrorCode.IMAGE_NOT_FOUND, "Uploaded image was not found.");
    }

    if (!(await authorization.userOwnsImage(request.auth.user.id, parsed.data.imageId))) {
      return sendError(reply, request, 404, ErrorCode.IMAGE_NOT_FOUND, "Uploaded image was not found.");
    }

    try {
      await ensureImagePersisted(parsed.data.imageId, request.auth.user.id, imageStorage, images);
    } catch (error) {
      return sendPersistenceError(reply, request, error);
    }

    const generationId = runner.start({
      ownerId: request.auth.user.id,
      imageId: parsed.data.imageId,
      projectId: parsed.data.projectId,
      deferPersist: Boolean(jobService),
    });

    logEvent("generation_created", {
      generationId,
      ownerId: request.auth.user.id,
      imageId: parsed.data.imageId,
      requestId: request.id,
      usesBackgroundJobs: Boolean(jobService),
    });

    if (jobService) {
      if (persistence && prisma) {
        const schema = await verifySchemaReadiness(prisma);
        if (!schema.ready) {
          return sendError(
            reply,
            request,
            503,
            ErrorCode.DATABASE_SCHEMA_MISSING,
            schema.message ?? "Database migrations are incomplete. Run pnpm db:migrate.",
          );
        }
      }

      // Non-atomic ordering: Generation row must exist before BackgroundJob FK insert.
      // Reservation + job status updates remain separate writes until a shared transaction is added.
      try {
        await store.persistById(generationId);
        logEvent("generation_persisted", { generationId, requestId: request.id });
      } catch (error) {
        const failureCode =
          error instanceof PersistenceError && error.code === ErrorCode.DATABASE_UNAVAILABLE
            ? ErrorCode.DATABASE_UNAVAILABLE
            : ErrorCode.GENERATION_PERSIST_FAILED;
        const failureMessage =
          error instanceof PersistenceError
            ? error.message
            : "Unable to persist the generation record before queueing design analysis.";

        store.markFailed(generationId, "design_analysis", failureCode, failureMessage, {
          manualRetryAllowed: true,
        });
        await store.persistById(generationId);
        return sendPersistenceError(reply, request, error);
      }

      try {
        const accepted = await jobService.enqueue({
          generationId,
          ownerId: request.auth!.user.id,
          jobType: "design_analysis",
          payload: { generationId, imageId: parsed.data.imageId },
          idempotencyKey: `design-analysis-${generationId}`,
        });
        logEvent("job_enqueued", {
          generationId,
          jobId: accepted.job.jobId,
          jobType: accepted.job.jobType,
          jobStatus: accepted.job.status,
          created: accepted.created,
          requestId: request.id,
        });
        return reply.status(202).send({
          generationId,
          job: JobAcceptedResponseSchema.parse(accepted.job),
        });
      } catch (error) {
        const failureCode =
          error instanceof UsageLimitError
            ? (error.code as (typeof ErrorCode)[keyof typeof ErrorCode])
            : ErrorCode.JOB_ENQUEUE_FAILED;
        const failureMessage =
          error instanceof UsageLimitError
            ? error.message
            : error instanceof PersistenceError
              ? error.message
              : "Unable to queue design analysis. Confirm database migrations are applied and the worker can start.";

        if (!(error instanceof UsageLimitError)) {
          logError("generation_enqueue_failed", error, {
            generationId,
            requestId: request.id,
            ...(error instanceof PersistenceError
              ? {
                  prismaCode: error.prismaCode,
                  modelName: error.modelName,
                  constraintName: error.constraintName,
                }
              : {}),
          });
        }

        store.markFailed(generationId, "design_analysis", failureCode, failureMessage, {
          manualRetryAllowed: !(error instanceof UsageLimitError),
        });
        await store.persistById(generationId);

        if (error instanceof UsageLimitError) {
          return sendError(
            reply,
            request,
            402,
            error.code as (typeof ErrorCode)[keyof typeof ErrorCode],
            error.message,
          );
        }

        return sendPersistenceError(
          reply,
          request,
          error instanceof PersistenceError ? error : new PersistenceError(failureMessage, ErrorCode.JOB_ENQUEUE_FAILED),
        );
      }
    }

    runner.kickoffWithoutJobs(generationId);

    const response = CreateGenerationResponseSchema.parse({ generationId });
    return reply.status(202).send(response);
  });

  app.get("/api/v1/generations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!requireAuth(request, reply)) {
      return;
    }

    if (persistence) {
      const hydrated = await hydrateOwnedGenerationRecord({
        store,
        persistence,
        generationId: id,
        ownerId: request.auth!.user.id,
      });
      if (!hydrated) {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }
    } else {
      const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
      if (!record) {
        return;
      }
    }

    if (jobService) {
      await reconcileStaleGenerationState(id, store, jobService.repository, jobService.config, jobService);
      await reconcileGenerationLocks(id, store, jobService.repository, {
        editLockTimeoutMs: jobService.config.lockTtlMs,
        visualCaptureTimeoutMs: Math.max(jobService.config.lockTtlMs * 2, 120_000),
      });
    }

    const refreshed = store.get(id);
    if (!refreshed) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const snapshot = store.toSnapshot(refreshed);
    const response = GenerationStatusResponseSchema.parse(snapshot);
    return reply.send(response);
  });

  app.post("/api/v1/generations/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!requireAuth(request, reply)) {
      return;
    }

    if (!jobService) {
      return sendError(
        reply,
        request,
        503,
        ErrorCode.DATABASE_UNAVAILABLE,
        "Generation retry requires the background job queue.",
      );
    }

    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
    }

    const result = await recoverFailedGeneration({
      record,
      store,
      jobService,
      imageStorage,
      ownerId: request.auth!.user.id,
    });

    if (!result.ok) {
      const statusCode =
        result.code === ErrorCode.IMAGE_NOT_FOUND || result.code === ErrorCode.GENERATION_NOT_FOUND
          ? 404
          : result.code === ErrorCode.FORBIDDEN
            ? 403
            : result.code === ErrorCode.AI_MONTHLY_BUDGET_EXCEEDED ||
                result.code === ErrorCode.AI_TOKEN_LIMIT_EXCEEDED ||
                result.code === ErrorCode.AI_OPERATION_COST_LIMIT_EXCEEDED
              ? 402
              : 409;
      return sendError(reply, request, statusCode, result.code as APIErrorBody["error"]["code"], result.message);
    }

    const job = await jobService.getOwnedJobStatus(result.jobId, request.auth!.user.id);
    const refreshed = store.get(id);
    return reply.status(result.created ? 202 : 200).send({
      status: refreshed?.status ?? "Analyzing",
      job: job ? JobAcceptedResponseSchema.parse({
        jobId: job.jobId,
        generationId: job.generationId,
        jobType: job.jobType,
        status: job.status,
        createdAt: job.createdAt,
        statusUrl: `/api/v1/jobs/${job.jobId}`,
      }) : undefined,
    });
  });

  app.post("/api/v1/generations/:id/confirm-plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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

    if (jobService) {
      const accepted = await jobService.enqueue({
        generationId: id,
        ownerId: request.auth!.user.id,
        jobType: "react_project_generation",
        payload: { generationId: id, editedByUser },
        idempotencyKey: `react-project-${id}-${updated?.confirmedAt ?? "pending"}`,
      });
      return reply.status(202).send({
        status: updated?.status ?? "Generating",
        job: JobAcceptedResponseSchema.parse(accepted.job),
      });
    }

    void runner.runSegment(id, "react_project_generation");

    const response = ConfirmPlanResponseSchema.parse({
      status: updated?.status ?? "Generating",
    });
    return reply.send(response);
  });

  app.post("/api/v1/generations/:id/sandbox-validation", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!requireAuth(request, reply)) {
      return;
    }

    if (persistence) {
      const hydrated = await hydrateOwnedGenerationRecord({
        store,
        persistence,
        generationId: id,
        ownerId: request.auth!.user.id,
      });
      if (!hydrated) {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }
    }

    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
    }

    logEvent("sandbox_validation_request_received", {
      generationId: id,
      awaitingSandboxValidation: record.awaitingSandboxValidation,
      projectHash: record.projectHash,
    });

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

    if (submitResult.shouldResume) {
      if (jobService) {
        const accepted = await jobService.enqueue({
          generationId: id,
          ownerId: request.auth!.user.id,
          jobType: "automatic_repair",
          payload: { generationId: id },
          idempotencyKey: `repair-${id}-${updated?.validationReportFingerprint ?? "unknown"}`,
        });
        return reply.status(202).send({
          status: updated?.status ?? "Repairing",
          job: JobAcceptedResponseSchema.parse(accepted.job),
        });
      }

      await runner.resumeFromSandbox(id);
    }

    const response = SandboxValidationResponseSchema.parse({
      status: updated?.status ?? "Repairing",
    });
    return reply.send(response);
  });

  app.post("/api/v1/generations/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    if (!requireAuth(request, reply)) {
      return;
    }

    if (persistence) {
      const hydrated = await hydrateOwnedGenerationRecord({
        store,
        persistence,
        generationId: id,
        ownerId: request.auth!.user.id,
      });
      if (!hydrated) {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }
    }

    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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
    if (!requireAuth(request, reply)) {
      return;
    }

    if (persistence) {
      const hydrated = await hydrateOwnedGenerationRecord({
        store,
        persistence,
        generationId: id,
        ownerId: request.auth!.user.id,
      });
      if (!hydrated) {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }
    }

    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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

  app.get("/api/v1/generations/:id/preview-styles.css", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!requireAuth(request, reply)) {
      return;
    }

    if (persistence) {
      const hydrated = await hydrateOwnedGenerationRecord({
        store,
        persistence,
        generationId: id,
        ownerId: request.auth!.user.id,
      });
      if (!hydrated) {
        return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
      }
    }

    const record = requireOwnedGeneration(authorization, request, reply, id, sendError);
    if (!record) {
      return;
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

    const styled = normalizeProjectStyling(record.outputs.generatedProject);
    const compiled = await compileTailwindCss(styled.project);
    if (!compiled.ok) {
      return sendError(reply, request, 422, ErrorCode.INTERNAL_ERROR, compiled.message);
    }

    return reply.header("Content-Type", "text/css; charset=utf-8").send(compiled.css);
  });
}
