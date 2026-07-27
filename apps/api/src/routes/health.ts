import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { APP_VERSION } from "@reactify/shared";
import type { Env } from "../env.js";
import { isAIProviderConfigured } from "../providers/ai-provider-config.js";
import { isWorkerPresenceFresh, readWorkerPresence, type WorkerPresenceStore } from "../jobs/worker-presence.js";
import { createJobRegistry } from "../jobs/job-registry.js";
import { verifySchemaReadiness } from "../persistence/schema-readiness.js";

export interface HealthResponse {
  status: "ok";
  version: string;
  timestamp: string;
}

export interface ReadyResponse {
  status: "ready" | "not_ready";
  version: string;
  timestamp: string;
  checks: {
    database: "ok" | "failed";
    schema: "ok" | "failed";
    worker: "ok" | "unavailable" | "not_required";
    configuration: "ok" | "failed";
  };
  message: string | null;
}

export interface HealthRouteDeps {
  prisma: PrismaClient;
  env: Env;
  workerPresenceStore: WorkerPresenceStore;
}

export async function registerHealthRoutes(app: FastifyInstance, deps?: HealthRouteDeps): Promise<void> {
  app.get("/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/ready", async (_request, reply): Promise<ReadyResponse> => {
    if (!deps) {
      return reply.status(503).send({
        status: "not_ready",
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
        checks: {
          database: "failed",
          schema: "failed",
          worker: "not_required",
          configuration: "failed",
        },
        message: "Readiness checks are unavailable in this process configuration.",
      });
    }

    const schema = await verifySchemaReadiness(deps.prisma);
    const presence = await readWorkerPresence(deps.workerPresenceStore);
    const workerFresh = isWorkerPresenceFresh(
      presence,
      Math.max(deps.env.JOB_WORKER_POLL_INTERVAL_MS * 3, 15_000),
    );

    const configurationOk = isAIProviderConfigured(deps.env);

    const workerCheck: ReadyResponse["checks"]["worker"] = deps.env.JOB_INLINE_EXECUTION
      ? "not_required"
      : workerFresh
        ? "ok"
        : "unavailable";

    const ready =
      schema.databaseConnected &&
      schema.ready &&
      configurationOk &&
      (deps.env.JOB_INLINE_EXECUTION || workerFresh);

    const message =
      !schema.databaseConnected
        ? schema.message
        : !schema.ready
          ? schema.message
          : !configurationOk
            ? "AI provider is not configured for background jobs."
            : workerCheck === "unavailable"
              ? "Background worker is unavailable. Start the worker process."
              : null;

    const body: ReadyResponse = {
      status: ready ? "ready" : "not_ready",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      checks: {
        database: schema.databaseConnected ? "ok" : "failed",
        schema: schema.ready ? "ok" : "failed",
        worker: workerCheck,
        configuration: configurationOk ? "ok" : "failed",
      },
      message,
    };

    return reply.status(ready ? 200 : 503).send(body);
  });

  app.get("/api/v1/system/readiness", async (_request, reply) => {
    if (!deps) {
      return reply.status(503).send({
        workerAvailable: false,
        message: "Readiness checks are unavailable.",
      });
    }

    const presence = await readWorkerPresence(deps.workerPresenceStore);
    const workerAvailable =
      deps.env.JOB_INLINE_EXECUTION ||
      isWorkerPresenceFresh(presence, Math.max(deps.env.JOB_WORKER_POLL_INTERVAL_MS * 3, 15_000));

    const registry = createJobRegistry({
      runner: {} as never,
      editService: {} as never,
      exportService: {} as never,
      visualComparisonService: {} as never,
    });

    return reply.send({
      workerAvailable,
      inlineExecution: deps.env.JOB_INLINE_EXECUTION,
      registeredJobTypes: [...registry.keys()],
      message: workerAvailable ? null : "Background worker is unavailable.",
    });
  });
}
