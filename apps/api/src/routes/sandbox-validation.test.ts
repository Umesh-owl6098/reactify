import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  completeSandboxValidation,
  createFailedCompilationSandboxValidationReport,
  createFailedRuntimeSandboxValidationReport,
  createSuccessfulSandboxValidationReport,
  createTestImage,
  createTestServer,
  submitSandboxValidationReport,
  waitForAwaitingSandboxValidation,
  waitForGenerationStatus,
} from "../test/helpers.js";

async function waitForPlanning(app: Awaited<ReturnType<typeof createTestServer>>["app"], generationId: string) {
  await waitForGenerationStatus(async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });
    return response.json() as { status: string };
  }, "Planning");
}

async function confirmPlan(
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
  generationId: string,
) {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/generations/${generationId}/confirm-plan`,
    payload: { plan: generationPlanFixture },
  });
  expect(response.statusCode).toBe(200);
}

describe("sandbox validation endpoint", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];
  let pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"];
  let imageId = "";

  beforeEach(async () => {
    const setup = await createTestServer();
    app = setup.app;
    pipeline = setup.pipeline;
    imageId = await createTestImage(setup.storageDir);
  });

  afterEach(async () => {
    await app.close();
  });

  async function startGeneration(): Promise<string> {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    return createResponse.json().generationId as string;
  }

  it("accepts a valid successful report and reaches preview ready", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("Ready");

    const record = pipeline.store.get(generationId);
    expect(record?.status).toBe("Ready");
    expect(record?.sandboxValidation?.compilation.success).toBe(true);
    expect(record?.sandboxValidation?.runtime.success).toBe(true);
  });

  it("continues to repair required when compilation fails", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("RepairRequired");

    const record = pipeline.store.get(generationId);
    expect(record?.status).toBe("RepairRequired");
    expect(record?.status).not.toBe("Ready");
  });

  it("continues to repair required when runtime fails", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createFailedRuntimeSandboxValidationReport({ generationId, projectHash }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("RepairRequired");
  });

  it("rejects invalid schema payloads", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);
    await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/sandbox-validation`,
      payload: { generationId },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("SANDBOX_REPORT_INVALID");
  });

  it("rejects route/body generation mismatches", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);
    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({
        generationId: "550e8400-e29b-41d4-a716-446655440000",
        projectHash,
      }),
    );

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("SANDBOX_REPORT_INVALID");
  });

  it("returns not found for missing generations", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/generations/550e8400-e29b-41d4-a716-446655440000/sandbox-validation",
      payload: createSuccessfulSandboxValidationReport({
        generationId: "550e8400-e29b-41d4-a716-446655440000",
        projectHash: "abc123def4567890abc123def4567890abc123def4567890abc123def4567890",
      }),
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects reports in the wrong generation state", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({
        generationId,
        projectHash: "abc123def4567890abc123def4567890abc123def4567890abc123def4567890",
      }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INVALID_GENERATION_STATE");
  });

  it("rejects hash mismatches", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);
    await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({
        generationId,
        projectHash: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      }),
    );

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("SANDBOX_REPORT_INVALID");
  });

  it("returns idempotent success for duplicate identical reports", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    const report = createSuccessfulSandboxValidationReport({ generationId, projectHash });
    const first = await submitSandboxValidationReport(app, generationId, report);
    expect(first.statusCode).toBe(200);

    await waitForGenerationStatus(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json() as { status: string };
    }, "Ready");

    const duplicate = await submitSandboxValidationReport(app, generationId, report);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().status).toBe("Ready");
  });

  it("returns conflict for conflicting duplicate reports", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
    );

    await waitForGenerationStatus(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json() as { status: string };
    }, "Ready");

    const conflicting = await submitSandboxValidationReport(
      app,
      generationId,
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
    );

    expect(conflicting.statusCode).toBe(409);
  });

  it("rejects reports for cancelled generations", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/cancel`,
    });

    const response = await submitSandboxValidationReport(
      app,
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
    );

    expect(response.statusCode).toBe(409);
  });

  it("rejects oversized reports", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
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
    });

    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("REPORT_TOO_LARGE");
  });

  it("resumes the pipeline exactly once through helper flow", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);
    await completeSandboxValidation(app, generationId, pipeline);

    const record = pipeline.store.get(generationId);
    expect(record?.status).toBe("Ready");
    expect(record?.stages.filter((stage) => stage.stage === "automatic_repair")).toHaveLength(1);
  });
});
