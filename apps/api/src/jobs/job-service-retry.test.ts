import { describe, expect, it, vi } from "vitest";
import { JobService } from "./job-service.js";

describe("JobService.retryJob", () => {
  it("creates a fresh code-generation job after a terminal prior attempt", async () => {
    const failedJob = {
      id: "11111111-1111-4111-8111-111111111111",
      generationId: "22222222-2222-4222-8222-222222222222",
      ownerId: "33333333-3333-4333-8333-333333333333",
      jobType: "react_project_generation",
      payload: { generationId: "22222222-2222-4222-8222-222222222222" },
      status: "failed",
      failureCode: "AI_RESPONSE_TRUNCATED",
    };
    const enqueue = vi.fn().mockResolvedValue({
      job: {
        jobId: "44444444-4444-4444-8444-444444444444",
        generationId: failedJob.generationId,
        jobType: failedJob.jobType,
        status: "queued",
        createdAt: new Date().toISOString(),
        statusUrl: "/api/v1/jobs/44444444-4444-4444-8444-444444444444",
      },
      created: true,
    });
    const service = Object.create(JobService.prototype) as JobService;
    Object.defineProperty(service, "env", {
      value: { AUTH_MODE: "session" },
    });
    Object.defineProperty(service, "repository", {
      value: {
        getOwnedJob: vi.fn().mockResolvedValue(failedJob),
        hasActiveMutationJob: vi.fn().mockResolvedValue(false),
      },
    });
    Object.defineProperty(service, "enqueue", { value: enqueue });

    const result = await service.retryJob(failedJob.id, failedJob.ownerId);

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: failedJob.generationId,
        jobType: "react_project_generation",
        payload: failedJob.payload,
        parentJobId: failedJob.id,
        idempotencyKey: expect.stringMatching(`^manual-retry-${failedJob.id}-`),
      }),
    );
  });

  it("does not overlap an already active mutation job", async () => {
    const service = Object.create(JobService.prototype) as JobService;
    Object.defineProperty(service, "env", {
      value: { AUTH_MODE: "session" },
    });
    Object.defineProperty(service, "repository", {
      value: {
        getOwnedJob: vi.fn().mockResolvedValue({
          id: "11111111-1111-4111-8111-111111111111",
          generationId: "22222222-2222-4222-8222-222222222222",
          ownerId: "33333333-3333-4333-8333-333333333333",
          jobType: "react_project_generation",
          payload: { generationId: "22222222-2222-4222-8222-222222222222" },
          status: "failed",
        }),
        hasActiveMutationJob: vi.fn().mockResolvedValue(true),
      },
    });
    const enqueue = vi.fn();
    Object.defineProperty(service, "enqueue", { value: enqueue });

    await expect(
      service.retryJob(
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
      ),
    ).resolves.toMatchObject({ ok: false, code: "JOB_ALREADY_ACTIVE" });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
