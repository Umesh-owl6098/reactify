import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { syncGenerationForJobStart } from "../jobs/generation-sync.js";
import { PersistenceError } from "../persistence/errors.js";
import {
  createAuthenticatedTestImage,
  createTestServer,
  PNG_1X1,
  withAuth,
} from "../test/helpers.js";
import type { JobService } from "../jobs/job-service.js";

function authed(app: Awaited<ReturnType<typeof createTestServer>>["app"], cookie: string, options: Parameters<typeof app.inject>[0]) {
  return app.inject(withAuth(cookie, options));
}

describe("POST /api/v1/generations persistence ordering", () => {
  it("persists the generation before enqueueing design_analysis", async () => {
    const callOrder: string[] = [];
    const context: { pipeline?: Awaited<ReturnType<typeof createTestServer>>["pipeline"] } = {};

    const jobService = {
      enqueue: vi.fn().mockImplementation(async (params) => {
        callOrder.push("enqueue");
        const record = context.pipeline?.store.get(params.generationId);
        if (record) {
          syncGenerationForJobStart(record, params.jobType);
        }
        return {
          job: {
            jobId: "11111111-1111-4111-8111-111111111111",
            generationId: params.generationId,
            jobType: "design_analysis",
            status: "queued",
            createdAt: new Date().toISOString(),
            statusUrl: "/api/v1/jobs/11111111-1111-4111-8111-111111111111",
          },
          created: true,
        };
      }),
    } as unknown as JobService;

    const server = await createTestServer({
      jobs: { jobService, jobRunner: {} as never, usageService: {} as never },
    });
    context.pipeline = server.pipeline;

    const store = server.pipeline.store;
    const persistById = store.persistById.bind(store);
    store.persistById = vi.fn(async (id: string) => {
      callOrder.push("persist");
      await persistById(id);
    });

    try {
      const imageId = await createAuthenticatedTestImage(server.app, server.authCookie, PNG_1X1);
      const response = await authed(server.app, server.authCookie, {
        method: "POST",
        url: "/api/v1/generations",
        payload: { imageId },
      });

      expect(response.statusCode).toBe(202);
      expect(callOrder.indexOf("persist")).toBeGreaterThanOrEqual(0);
      expect(callOrder.indexOf("enqueue")).toBeGreaterThan(callOrder.indexOf("persist"));
    } finally {
      await server.app.close();
    }
  });

  it("does not enqueue when generation persistence fails", async () => {
    const jobService = {
      enqueue: vi.fn(),
    } as unknown as JobService;

    const server = await createTestServer({
      jobs: { jobService, jobRunner: {} as never, usageService: {} as never },
    });

    const store = server.pipeline.store;
    store.persistById = vi.fn(async () => {
      throw new PersistenceError("Database query failed.", ErrorCode.GENERATION_PERSIST_FAILED);
    });

    try {
      const imageId = await createAuthenticatedTestImage(server.app, server.authCookie, PNG_1X1);
      const response = await authed(server.app, server.authCookie, {
        method: "POST",
        url: "/api/v1/generations",
        payload: { imageId },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(jobService.enqueue).not.toHaveBeenCalled();
    } finally {
      await server.app.close();
    }
  });

  it("marks enqueue failures as JOB_ENQUEUE_FAILED", async () => {
    const jobService = {
      enqueue: vi.fn().mockRejectedValue(
        new PersistenceError("Design analysis could not be queued.", ErrorCode.JOB_ENQUEUE_FAILED, {
          prismaCode: "P2003",
          constraintName: "BackgroundJob_generationId_fkey",
        }),
      ),
    } as unknown as JobService;

    const server = await createTestServer({
      jobs: { jobService, jobRunner: {} as never, usageService: {} as never },
    });

    try {
      const imageId = await createAuthenticatedTestImage(server.app, server.authCookie, PNG_1X1);
      const response = await authed(server.app, server.authCookie, {
        method: "POST",
        url: "/api/v1/generations",
        payload: { imageId },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      const generationId = vi.mocked(jobService.enqueue).mock.calls[0]?.[0]?.generationId;
      const record = server.pipeline.store.get(generationId!)!;
      expect(record.errors.at(-1)?.code).toBe(ErrorCode.JOB_ENQUEUE_FAILED);
    } finally {
      await server.app.close();
    }
  });
});
