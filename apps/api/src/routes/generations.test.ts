import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  createTestImage,
  createTestServer,
  waitForGenerationStatus,
} from "../test/helpers.js";

async function waitForPlanning(app: Awaited<ReturnType<typeof createTestServer>>["app"], generationId: string) {
  await waitForGenerationStatus(async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });
    return response.json() as { status: string; awaitingPlanConfirmation?: boolean };
  }, "Planning");
}

describe("generation routes", () => {
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

  it("starts a generation and returns generationId", async () => {
    const response = await app.inject({
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
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);

    const statusResponse = await app.inject({
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
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);

    const confirmResponse = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().status).toBe("Generating");

    await waitForGenerationStatus(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json() as { status: string };
    }, "Ready");

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    const body = statusResponse.json();
    expect(body.status).toBe("Ready");
    expect(body.outputs.generatedProject).not.toBeNull();
    expect(body.confirmedAt).not.toBeNull();
  });

  it("returns 409 when confirming in the wrong state", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INVALID_GENERATION_STATE");
  });

  it("returns idempotent success for duplicate confirmation after resume", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);

    await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    await waitForGenerationStatus(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json() as { status: string };
    }, "Ready");

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().status).toBe("Ready");
  });

  it("returns 422 for invalid plan payloads", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: { schemaVersion: "1" } },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("PLAN_SCHEMA_INVALID");
  });

  it("returns 404 for unknown generation", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/generations/550e8400-e29b-41d4-a716-446655440000",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("GENERATION_NOT_FOUND");
  });

  it("returns 404 when starting generation for a missing image", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId: "550e8400-e29b-41d4-a716-446655440000" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("IMAGE_NOT_FOUND");
  });

  it("supports cancelling while awaiting plan confirmation", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/cancel`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json().status).toBe("Cancelled");

    const confirmResponse = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    expect(confirmResponse.statusCode).toBe(409);
  });

  it("supports cancelling an in-memory generation", async () => {
    const generationId = pipeline.store.create({ imageId }).id;
    const runPromise = pipeline.runner.run(generationId);
    pipeline.store.cancel(generationId);
    await runPromise;

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    expect(response.json().status).toBe("Cancelled");
  });
});
