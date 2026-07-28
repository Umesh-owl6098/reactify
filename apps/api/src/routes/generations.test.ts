import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  createTestServer,
  completeSandboxValidation,
  waitForGenerationStatus,
  withAuth,
  PNG_1X1,
  createAuthenticatedTestImage,
  registerTestUser,
} from "../test/helpers.js";

function authed(app: Awaited<ReturnType<typeof createTestServer>>["app"], cookie: string, options: Parameters<typeof app.inject>[0]) {
  return app.inject(withAuth(cookie, options));
}

async function waitForPlanning(
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
  cookie: string,
  generationId: string,
) {
  await waitForGenerationStatus(async () => {
    const response = await authed(app, cookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });
    return response.json() as { status: string; awaitingPlanConfirmation?: boolean };
  }, "Planning");
}

async function confirmPlanAndCompleteSandbox(
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
  cookie: string,
  pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"],
  generationId: string,
) {
  await authed(app, cookie, {
    method: "POST",
    url: `/api/v1/generations/${generationId}/confirm-plan`,
    payload: { plan: generationPlanFixture },
  });

  await completeSandboxValidation(app, cookie, generationId, pipeline);
}

describe("generation routes", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];
  let pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"];
  let authCookie = "";
  let userId = "";
  let imageId = "";

  beforeEach(async () => {
    const setup = await createTestServer({ pipelineEnv: { AI_PROVIDER: "anthropic" } });
    app = setup.app;
    pipeline = setup.pipeline;
    authCookie = setup.authCookie;
    userId = setup.userId;
    imageId = await createAuthenticatedTestImage(app, authCookie, PNG_1X1);
  });

  afterEach(async () => {
    await app.close();
  });

  it("starts a generation and returns generationId", async () => {
    const response = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().generationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("pauses at Planning with a validated generation plan", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    const statusResponse = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    const body = statusResponse.json();
    expect(body.status).toBe("Planning");
    expect(body.awaitingPlanConfirmation).toBe(true);
    expect(body.outputs.designAnalysis).not.toBeNull();
    expect(body.outputs.generationPlan).not.toBeNull();
    expect(body.plan).toMatchObject({ provider: "mock", promptVersion: "1.0.0" });
    expect(body.outputs.generatedProject).toBeNull();
  });

  it("returns generation status with outputs when plan is confirmed", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    await confirmPlanAndCompleteSandbox(app, authCookie, pipeline, generationId);

    const statusResponse = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    const body = statusResponse.json();
    expect(body.status).toBe("Ready");
    expect(body.outputs.generatedProject).not.toBeNull();
    expect(body.confirmedAt).not.toBeNull();
  });

  it("returns safe terminal error metadata in generation status", async () => {
    const record = pipeline.store.create({ ownerId: userId, imageId });
    record.status = "Failed";
    record.activeStage = null;
    record.errors.push({
      stage: "react_project_generation",
      code: "GENERATED_PROJECT_SCHEMA_INVALID",
      message: "Generated project response failed schema validation.",
      provider: "openai",
      model: "gpt-test",
      httpStatus: 422,
      providerRequestId: "req-safe-123",
      retryable: false,
      validationIssues: [
        {
          path: "files.0.path",
          code: "invalid_type",
          message: "Expected string.",
        },
      ],
    });

    const response = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${record.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().errors).toEqual(record.errors);
  });

  it("returns 409 when confirming a cancelled generation", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/cancel`,
    });

    const response = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INVALID_GENERATION_STATE");
  });

  it("returns idempotent success for duplicate confirmation after resume", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    await completeSandboxValidation(app, authCookie, generationId, pipeline);

    const duplicate = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().status).toBe("Ready");
  });

  it("returns 422 for invalid plan payloads", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    const response = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: { schemaVersion: "1" } },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("PLAN_SCHEMA_INVALID");
  });

  it("returns 404 for unknown generation", async () => {
    const response = await authed(app, authCookie, {
      method: "GET",
      url: "/api/v1/generations/550e8400-e29b-41d4-a716-446655440000",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GENERATION_NOT_FOUND");
  });

  it("returns 404 when starting generation for a missing image", async () => {
    const response = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId: "550e8400-e29b-41d4-a716-446655440000" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("IMAGE_NOT_FOUND");
  });

  it("supports cancelling while awaiting plan confirmation", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    const cancelResponse = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/cancel`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json().status).toBe("Cancelled");

    const confirmResponse = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    expect(confirmResponse.statusCode).toBe(409);
  });

  it("supports cancelling an in-memory generation", async () => {
    const generationId = pipeline.store.create({ ownerId: userId, imageId }).id;
    const runPromise = pipeline.runner.run(generationId);
    pipeline.store.cancel(generationId);
    await runPromise;

    const response = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    expect(response.json().status).toBe("Cancelled");
  });

  it("returns generated project metadata without file contents when ready", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    await confirmPlanAndCompleteSandbox(app, authCookie, pipeline, generationId);

    const statusResponse = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    const body = statusResponse.json();
    expect(body.outputs.generatedProject.files[0]).toMatchObject({
      path: expect.any(String),
      sizeBytes: expect.any(Number),
    });
    expect(body.outputs.generatedProject.files[0].content).toBeUndefined();
    expect(body.project).toMatchObject({ provider: "mock" });
    expect(JSON.stringify(body)).not.toMatch(/ANTHROPIC_API_KEY|Generate a React project/);
  });

  it("lists generated files and returns selected file content", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    await confirmPlanAndCompleteSandbox(app, authCookie, pipeline, generationId);

    const listResponse = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/files`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().files.length).toBeGreaterThan(0);
    expect(listResponse.json().files[0].content).toBeUndefined();

    const contentResponse = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/files/content?path=${encodeURIComponent("src/App.tsx")}`,
    });

    expect(contentResponse.statusCode).toBe(200);
    expect(contentResponse.json().content).toContain("HeroSection");
  });

  it("rejects traversal attempts and missing files on file content endpoint", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);

    await confirmPlanAndCompleteSandbox(app, authCookie, pipeline, generationId);

    const traversal = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/files/content?path=${encodeURIComponent("../secret.ts")}`,
    });

    expect(traversal.statusCode).toBe(422);

    const missing = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/files/content?path=${encodeURIComponent("src/DoesNotExist.tsx")}`,
    });

    expect(missing.statusCode).toBe(404);
  });

  it("rejects unauthenticated generation creation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      headers: { origin: "http://localhost:5174" },
      payload: { imageId },
    });

    expect(response.statusCode).toBe(401);
  });

  it("does not expose another user's generation", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;

    const otherUser = await registerTestUser(app, {
      email: `other-${randomUUID()}@example.com`,
      password: "secure-password-123",
      displayName: "Other User",
    });

    const response = await authed(app, otherUser.cookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GENERATION_NOT_FOUND");
  });
});
