import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AiEstimateRequestSchema,
  AiEstimateResponseSchema,
  ErrorCode,
  GenerationUsageResponseSchema,
  UsageAccountResponseSchema,
  UsageOperationListResponseSchema,
  UsageOperationSummarySchema,
  microsToUsd,
} from "@reactify/shared";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { requireAuth } from "../auth/middleware.js";
import { requireOwnedGeneration } from "../lib/generationAccess.js";
import type { UsageService } from "../usage/usage-service.js";
import { UsageLimitError } from "../usage/usage-service.js";
import type { Env } from "../env.js";

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
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

function sendUsageError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string,
): FastifyReply {
  return sendError(reply, request, statusCode, code, message);
}

function mapUsageRecord(record: {
  id: string;
  generationId: string | null;
  jobId: string | null;
  operationType: string;
  provider: string;
  model: string;
  status: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  estimatedCostMicrosUsd: bigint;
  actualCostMicrosUsd: bigint | null;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return UsageOperationSummarySchema.parse({
    usageId: record.id,
    generationId: record.generationId ?? undefined,
    jobId: record.jobId ?? undefined,
    operationType: record.operationType,
    provider: record.provider,
    model: record.model,
    status: record.status,
    estimatedInputTokens: record.estimatedInputTokens,
    estimatedOutputTokens: record.estimatedOutputTokens,
    actualInputTokens: record.actualInputTokens ?? undefined,
    actualOutputTokens: record.actualOutputTokens ?? undefined,
    estimatedCostUsd: microsToUsd(Number(record.estimatedCostMicrosUsd)),
    actualCostUsd:
      record.actualCostMicrosUsd === null ? undefined : microsToUsd(Number(record.actualCostMicrosUsd)),
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
  });
}

export async function registerUsageRoutes(
  app: FastifyInstance,
  usageService: UsageService,
  authorization: AuthorizationService,
  env: Env,
): Promise<void> {
  app.get("/api/v1/account/usage", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const account = await usageService.getAccountUsage(request.auth!.user.id);
    return reply.send(UsageAccountResponseSchema.parse(account));
  });

  app.get("/api/v1/account/usage/operations", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const query = request.query as {
      operationType?: string;
      status?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
      order?: "asc" | "desc";
    };

    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const offset = Math.max(Number(query.offset ?? 0), 0);
    const order = query.order === "asc" ? "asc" : "desc";

    const result = await usageService.repository.listOperations({
      ownerId: request.auth!.user.id,
      operationType: query.operationType,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit,
      offset,
      order,
    });

    return reply.send(
      UsageOperationListResponseSchema.parse({
        total: result.total,
        limit,
        offset,
        items: result.items.map(mapUsageRecord),
      }),
    );
  });

  app.get("/api/v1/generations/:generationId/usage", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const { generationId } = request.params as { generationId: string };
    const owned = requireOwnedGeneration(
      authorization,
      request,
      reply,
      generationId,
      sendUsageError,
    );
    if (!owned) {
      return;
    }

    const account = await usageService.getAccountUsage(request.auth!.user.id);
    const operations = await usageService.repository.listOperations({
      ownerId: request.auth!.user.id,
      generationId,
      limit: 100,
      offset: 0,
      order: "desc",
    });

    const generationOps = operations.items;
    const inputTokens = generationOps.reduce((sum, row) => sum + (row.actualInputTokens ?? 0), 0);
    const outputTokens = generationOps.reduce((sum, row) => sum + (row.actualOutputTokens ?? 0), 0);
    const actualCostMicros = generationOps.reduce(
      (sum, row) => sum + Number(row.actualCostMicrosUsd ?? 0),
      0,
    );

    return reply.send(
      GenerationUsageResponseSchema.parse({
        generationId,
        summary: {
          ...account.summary,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          actualCostUsd: microsToUsd(actualCostMicros),
          operationCount: generationOps.length,
        },
        operations: generationOps.map(mapUsageRecord),
      }),
    );
  });

  app.post("/api/v1/generations/:generationId/ai-estimate", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }

    const { generationId } = request.params as { generationId: string };
    const owned = requireOwnedGeneration(
      authorization,
      request,
      reply,
      generationId,
      sendUsageError,
    );
    if (!owned) {
      return;
    }

    const parsed = AiEstimateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 400, ErrorCode.INVALID_GENERATION_STATE, "Invalid estimate request.");
    }

    try {
      const provider = env.AI_PROVIDER === "mock" ? "mock" : "anthropic";
      const estimate = usageService.estimateOperation({
        operationType: parsed.data.operationType,
        maxOutputTokens: env.AI_MAX_TOKENS,
        instruction: parsed.data.instruction,
        selectedFiles: parsed.data.selectedFiles,
        selectedComponentIds: parsed.data.selectedComponentIds,
        provider,
        model: env.ANTHROPIC_MODEL,
      });

      const limits = await usageService.checkLimits({
        ownerId: request.auth!.user.id,
        estimatedInputTokens: estimate.estimatedInputTokens,
        estimatedOutputTokens: estimate.estimatedOutputTokens,
        estimatedCostMicrosUsd: estimate.estimatedCostMicrosUsd,
      });

      return reply.send(
        AiEstimateResponseSchema.parse({
          operationType: parsed.data.operationType,
          estimatedInputTokens: estimate.estimatedInputTokens,
          estimatedOutputTokens: estimate.estimatedOutputTokens,
          estimatedCostUsd: microsToUsd(estimate.estimatedCostMicrosUsd),
          allowed: limits.allowed,
          blockedReason: limits.blockedReason,
          remainingBudgetUsd: limits.remainingBudgetUsd,
          remainingTokens: limits.remainingTokens,
          warningMessage: limits.warningMessage,
        }),
      );
    } catch (error) {
      if (error instanceof UsageLimitError) {
        return sendError(reply, request, 402, error.code, error.message);
      }
      return sendError(reply, request, 402, ErrorCode.AI_PRICING_NOT_CONFIGURED, "Pricing is not configured for the selected model.");
    }
  });
}

export function registerUsageErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UsageLimitError) {
      return reply.status(402).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id || randomUUID(),
        },
      });
    }

    const statusCode = typeof (error as { statusCode?: number }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;

    return reply.status(statusCode).send({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : "Internal server error",
        requestId: request.id || randomUUID(),
      },
    });
  });
}
