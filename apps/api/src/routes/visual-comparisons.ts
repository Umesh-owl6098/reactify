import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  PreviewScreenshotSubmissionSchema,
  VisualComparisonDetailResponseSchema,
  VisualComparisonHistoryListResponseSchema,
  VisualComparisonRequestSchema,
  VisualComparisonResultSchema,
  VisualCorrectionRequestSchema,
  type VisualComparisonArtifactType,
} from "@reactify/generation-contracts";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import type { VisualComparisonService } from "../lib/visual-comparison/VisualComparisonService.js";
import type { GenerationStore } from "../pipeline/store.js";

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

const ARTIFACT_CONTENT_TYPES: Record<VisualComparisonArtifactType, string> = {
  source: "image/png",
  preview: "image/png",
  diff: "image/png",
  overlay: "image/png",
  regions: "image/png",
};

export async function registerVisualComparisonRoutes(
  app: FastifyInstance,
  store: GenerationStore,
  visualComparisonService: VisualComparisonService,
): Promise<void> {
  app.post("/api/v1/generations/:id/visual-comparisons", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const parsed = VisualComparisonRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INVALID_GENERATION_STATE, "Invalid visual comparison request body.");
    }

    const idempotencyKey = request.headers["idempotency-key"];
    const result = await visualComparisonService.createComparison(
      record,
      parsed.data,
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );

    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.status(result.duplicate ? 200 : 201).send(VisualComparisonResultSchema.parse(result.comparison));
  });

  app.post("/api/v1/generations/:id/visual-comparisons/:comparisonId/screenshot", async (request, reply) => {
    const { id, comparisonId } = request.params as { id: string; comparisonId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const parsed = PreviewScreenshotSubmissionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.SCREENSHOT_CAPTURE_FAILED, "Invalid preview screenshot submission.");
    }

    const result = await visualComparisonService.submitScreenshot(record, comparisonId, parsed.data);
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.send(VisualComparisonResultSchema.parse(result.comparison));
  });

  app.get("/api/v1/generations/:id/visual-comparisons", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    return reply.send(
      VisualComparisonHistoryListResponseSchema.parse({
        generationId: id,
        comparisons: visualComparisonService.listComparisons(record),
      }),
    );
  });

  app.get("/api/v1/generations/:id/visual-comparisons/:comparisonId", async (request, reply) => {
    const { id, comparisonId } = request.params as { id: string; comparisonId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const comparison = visualComparisonService.getComparison(record, comparisonId);
    if (!comparison) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Visual comparison not found.");
    }

    return reply.send(
      VisualComparisonDetailResponseSchema.parse({
        generationId: id,
        comparison,
      }),
    );
  });

  app.get("/api/v1/generations/:id/visual-comparisons/:comparisonId/artifacts/:artifactType", async (request, reply) => {
    const { id, comparisonId, artifactType } = request.params as {
      id: string;
      comparisonId: string;
      artifactType: string;
    };

    if (!["source", "preview", "diff", "overlay", "regions"].includes(artifactType)) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Invalid artifact type.");
    }

    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const artifact = await visualComparisonService.readArtifact(
      record,
      comparisonId,
      artifactType as VisualComparisonArtifactType,
    );
    if (!artifact) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Artifact not found.");
    }

    return reply
      .header("Content-Type", ARTIFACT_CONTENT_TYPES[artifactType as VisualComparisonArtifactType])
      .header("Cache-Control", "no-store")
      .send(artifact);
  });

  app.post("/api/v1/generations/:id/visual-comparisons/:comparisonId/correct", async (request, reply) => {
    const { id, comparisonId } = request.params as { id: string; comparisonId: string };
    const record = store.get(id);
    if (!record) {
      return sendError(reply, request, 404, ErrorCode.GENERATION_NOT_FOUND, "Generation not found.");
    }

    const parsed = VisualCorrectionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INVALID_GENERATION_STATE, "Invalid visual correction request body.");
    }

    const result = await visualComparisonService.applyCorrection(record, comparisonId, parsed.data);
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.errorCode, result.message);
    }

    void store.persist(record);
    return reply.send(VisualComparisonResultSchema.parse(result.comparison));
  });
}
