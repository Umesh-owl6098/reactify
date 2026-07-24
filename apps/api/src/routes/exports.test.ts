import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  completeSandboxValidation,
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
    return response.json() as { status: string };
  }, "Planning");
}

async function confirmPlan(app: Awaited<ReturnType<typeof createTestServer>>["app"], generationId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/generations/${generationId}/confirm-plan`,
    payload: { plan: generationPlanFixture },
  });
  expect(response.statusCode).toBe(200);
}

describe("export routes", () => {
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

  it("creates and downloads an export for a validated project", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);
    await completeSandboxValidation(app, generationId, pipeline);

    const blocked = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {},
    });
    expect(blocked.statusCode).toBe(201);

    const status = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });
    expect(status.json().exportAllowed).toBe(true);

    const exportId = blocked.json().exportId as string;
    const download = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}/exports/${exportId}/download`,
    });

    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("application/zip");
    expect(download.headers["content-disposition"]).toContain(".zip");
    expect(download.rawPayload.length).toBeGreaterThan(0);
    expect(JSON.stringify(download.headers)).not.toContain("storage/");
  });

  it("creates MockLandingPage export with metadata enabled and summary disabled", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);
    await completeSandboxValidation(app, generationId, pipeline);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {
        projectName: "MockLandingPage",
        includeMetadata: true,
        includeGenerationSummary: false,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("ready");
    expect(response.json().filename).toBe("mocklandingpage-v1.zip");
    expect(response.json().projectName).toBe("mocklandingpage");

    const exportId = response.json().exportId as string;
    const download = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}/exports/${exportId}/download`,
    });

    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("application/zip");
  });

  it("rejects export before validation completes", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INVALID_GENERATION_STATE");
  });

  it("returns export history and supports idempotent creation", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, generationId);
    await confirmPlan(app, generationId);
    await completeSandboxValidation(app, generationId, pipeline);

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      headers: { "idempotency-key": "export-key-1" },
      payload: { includeMetadata: true },
    });
    expect(first.statusCode).toBe(201);
    const exportId = first.json().exportId as string;

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      headers: { "idempotency-key": "export-key-1" },
      payload: { includeMetadata: true },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().exportId).toBe(exportId);

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}/exports`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().exports).toHaveLength(1);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}/exports/${exportId}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().export.exportId).toBe(exportId);
    expect(JSON.stringify(detail.json())).not.toMatch(/api[_-]?key|secret|prompt|rawResponse/i);
  });
});
