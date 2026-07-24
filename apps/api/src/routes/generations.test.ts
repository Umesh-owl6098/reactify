import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestImage,
  createTestServer,
  waitForGenerationStatus,
} from "../test/helpers.js";

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

  it("returns generation status with outputs when pipeline completes", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });

    const generationId = createResponse.json().generationId as string;

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
    expect(body.outputs.designAnalysis).not.toBeNull();
    expect(body.analysis).toMatchObject({
      provider: "mock",
      promptVersion: "1.0.0",
    });
    expect(body.outputs.generationPlan).not.toBeNull();
    expect(body.outputs.generatedProject).not.toBeNull();
    expect(body.durations.totalMs).toBeGreaterThanOrEqual(0);
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
