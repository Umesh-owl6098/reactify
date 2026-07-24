import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { syncGenerationForJobStart } from "../jobs/generation-sync.js";
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

describe("POST /api/v1/generations job enqueue", () => {
  it("creates a design_analysis background job when generation creation succeeds", async () => {
    const context: { pipeline?: Awaited<ReturnType<typeof createTestServer>>["pipeline"] } = {};
    const jobService = {
      enqueue: vi.fn().mockImplementation(async (params) => {
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

    try {
      const imageId = await createAuthenticatedTestImage(server.app, server.authCookie, PNG_1X1);
      const response = await authed(server.app, server.authCookie, {
        method: "POST",
        url: "/api/v1/generations",
        payload: { imageId },
      });

      expect(response.statusCode).toBe(202);
      const body = response.json() as { generationId: string; job: { jobType: string; status: string } };
      expect(body.job.jobType).toBe("design_analysis");
      expect(body.job.status).toBe("queued");
      expect(jobService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: "design_analysis",
          generationId: body.generationId,
        }),
      );
      expect(context.pipeline?.store.get(body.generationId)?.status).toBe("Analyzing");
    } finally {
      await server.app.close();
    }
  });

  it("marks the generation failed with JOB_ENQUEUE_FAILED when queueing fails", async () => {
    const jobService = {
      enqueue: vi.fn().mockRejectedValue(new Error("queue unavailable")),
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
      expect(jobService.enqueue).toHaveBeenCalledTimes(1);

      const generationId = vi.mocked(jobService.enqueue).mock.calls[0]?.[0]?.generationId;
      expect(generationId).toBeTruthy();

      const record = server.pipeline.store.get(generationId!)!;
      expect(record.status).toBe("Failed");
      expect(record.failStage).toBe("design_analysis");
      expect(record.errors.some((entry) => entry.code === ErrorCode.JOB_ENQUEUE_FAILED)).toBe(true);
      expect(record.status).not.toBe("Analyzing");
    } finally {
      await server.app.close();
    }
  });
});
