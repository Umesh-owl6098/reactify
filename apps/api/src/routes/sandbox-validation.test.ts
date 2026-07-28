import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatedProjectFixture, generationPlanFixture } from "@reactify/test-utils";
import type { JobService } from "../jobs/job-service.js";
import { computeProjectHash } from "../lib/projectHash.js";
import {
  completeSandboxValidation,
  createFailedCompilationSandboxValidationReport,
  createFailedRuntimeSandboxValidationReport,
  createSuccessfulSandboxValidationReport,
  createTestServer,
  submitSandboxValidationReport,
  waitForAwaitingSandboxValidation,
  waitForGenerationStatus,
  withAuth,
  PNG_1X1,
  createAuthenticatedTestImage,
} from "../test/helpers.js";

async function waitForPlanning(
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
  cookie: string,
  generationId: string,
) {
  await waitForGenerationStatus(async () => {
    const response = await app.inject(
      withAuth(cookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }),
    );
    return response.json() as { status: string };
  }, "Planning");
}

async function confirmPlan(
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
  cookie: string,
  generationId: string,
) {
  const response = await app.inject(
    withAuth(cookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    }),
  );
  expect(response.statusCode).toBe(200);
}

describe("sandbox validation endpoint", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];
  let pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"];
  let authCookie = "";
  let imageId = "";

  beforeEach(async () => {
    const setup = await createTestServer({ pipelineEnv: { AI_PROVIDER: "anthropic" } });
    app = setup.app;
    pipeline = setup.pipeline;
    authCookie = setup.authCookie;
    imageId = await createAuthenticatedTestImage(app, authCookie, PNG_1X1);
  });

  afterEach(async () => {
    await app.close();
  });

  async function startGeneration(): Promise<string> {
    const createResponse = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/generations",
        payload: { imageId },
      }),
    );
    return createResponse.json().generationId as string;
  }

  it("accepts a valid successful report and reaches preview ready", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("Ready");

    const record = pipeline.store.get(generationId);
    expect(record?.status).toBe("Ready");
    expect(record?.sandboxValidation?.compilation.success).toBe(true);
    expect(record?.sandboxValidation?.runtime.success).toBe(true);
  });

  it("continues to repair revalidation when compilation fails", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    expect(response.statusCode).toBe(200);

    const record = pipeline.store.get(generationId);
    expect(record?.awaitingSandboxValidation).toBe(true);
    expect(record?.repairAttempts.length).toBe(1);
    expect(record?.repairStatus).toBe("waiting_for_revalidation");
    expect(record?.status).not.toBe("Ready");
  });

  it("continues repair loop when runtime fails", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createFailedRuntimeSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    expect(response.statusCode).toBe(200);
    const record = pipeline.store.get(generationId);
    expect(record?.repairAttempts.length).toBe(1);
    expect(record?.awaitingSandboxValidation).toBe(true);
  });

  it("rejects invalid schema payloads", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);
    await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const response = await app.inject(withAuth(authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/sandbox-validation`,
      payload: { generationId },
    }));

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("SANDBOX_REPORT_INVALID");
  });

  it("rejects route/body generation mismatches", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);
    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({
        generationId: "550e8400-e29b-41d4-a716-446655440000",
        projectHash,
      }),
      authCookie,
    );

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("SANDBOX_REPORT_INVALID");
  });

  it("returns not found for missing generations", async () => {
    const response = await app.inject(withAuth(authCookie, {
      method: "POST",
      url: "/api/v1/generations/550e8400-e29b-41d4-a716-446655440000/sandbox-validation",
      payload: createSuccessfulSandboxValidationReport({
        generationId: "550e8400-e29b-41d4-a716-446655440000",
        projectHash: "abc123def4567890abc123def4567890abc123def4567890abc123def4567890",
      }),
    }));

    expect(response.statusCode).toBe(404);
  });

  it("rejects reports in the wrong generation state", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({
        generationId,
        projectHash: "abc123def4567890abc123def4567890abc123def4567890abc123def4567890",
      }),
      authCookie,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INVALID_GENERATION_STATE");
  });

  it("rejects hash mismatches", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);
    await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({
        generationId,
        projectHash: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      }),
      authCookie,
    );

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("SANDBOX_REPORT_INVALID");
  });

  it("returns idempotent success for duplicate identical reports", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const report = createSuccessfulSandboxValidationReport({ generationId, projectHash });
    const first = await submitSandboxValidationReport(app, generationId, report, authCookie);
    expect(first.statusCode).toBe(200);

    await waitForGenerationStatus(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json() as { status: string };
    }, "Ready");

    const duplicate = await submitSandboxValidationReport(app, generationId, report, authCookie);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().status).toBe("Ready");
  });

  it("returns conflict for conflicting duplicate reports", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    await waitForGenerationStatus(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json() as { status: string };
    }, "Ready");

    const conflicting = await submitSandboxValidationReport(
      app,
      generationId,
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    expect(conflicting.statusCode).toBe(409);
  });

  it("rejects reports for cancelled generations", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    await app.inject(withAuth(authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/cancel`,
    }));

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    expect(response.statusCode).toBe(409);
  });

  it("rejects oversized reports", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject(withAuth(authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }));
      return response.json();
    });

    const response = await submitSandboxValidationReport(app, generationId, {
      ...createSuccessfulSandboxValidationReport({ generationId, projectHash }),
      runtime: {
        success: false,
        durationMs: 10,
        errors: Array.from({ length: 401 }, (_, index) => ({
          code: `ERR_${index}`,
          message: "runtime failure",
          severity: "error" as const,
          source: "runtime" as const,
          category: "runtime-error",
        })),
        warnings: [],
      },
    }, authCookie);

    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("REPORT_TOO_LARGE");
  });

  it("resumes the pipeline exactly once through helper flow", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);
    await completeSandboxValidation(app, authCookie, generationId, pipeline);

    const record = pipeline.store.get(generationId);
    expect(record?.status).toBe("Ready");
    expect(record?.stages.filter((stage) => stage.stage === "automatic_repair")).toHaveLength(1);
  });

  it("persists accepted validation and version state before repair enqueue", async () => {
    let persisted = false;
    const callOrder: string[] = [];
    const jobService = {
      enqueue: vi.fn().mockImplementation(async (params) => {
        callOrder.push("enqueue");
        expect(persisted).toBe(true);
        return {
          job: {
            jobId: "11111111-1111-4111-8111-111111111111",
            generationId: params.generationId,
            jobType: "automatic_repair",
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
      pipelineEnv: { AI_PROVIDER: "anthropic" },
    });

    try {
      const generationId = server.pipeline.runner.start({
        ownerId: server.userId,
        imageId: "660e8400-e29b-41d4-a716-446655440000",
      });
      const record = server.pipeline.store.get(generationId)!;
      const projectHash = computeProjectHash(generatedProjectFixture);
      record.status = "Compiling";
      record.outputs.generatedProject = structuredClone(generatedProjectFixture);
      record.projectHash = projectHash;
      record.schemaValidation = { valid: true, errors: [] };
      record.staticValidation = { valid: true, errors: [], warnings: [] };
      record.awaitingSandboxValidation = true;
      record.pipelineState = {
        imageId: record.imageId,
        generatedProject: structuredClone(generatedProjectFixture),
        projectHash,
      };
      server.pipeline.store.setPersistHandler(async (persistedRecord) => {
        callOrder.push("persist");
        expect(persistedRecord.validationReportFingerprint).toBeTruthy();
        expect(persistedRecord.activeVersionId).toBeTruthy();
        expect(persistedRecord.versions).toHaveLength(1);
        persisted = true;
      });

      const response = await submitSandboxValidationReport(
        server.app,
        generationId,
        createSuccessfulSandboxValidationReport({ generationId, projectHash }),
        server.authCookie,
      );

      expect(response.statusCode).toBe(202);
      expect(callOrder).toEqual(["persist", "enqueue"]);
    } finally {
      await server.app.close();
    }
  });
});
