import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  createTestServer,
  waitForGenerationStatus,
  withAuth,
  PNG_1X1,
  createAuthenticatedTestImage,
} from "../test/helpers.js";

function authed(app: Awaited<ReturnType<typeof createTestServer>>["app"], cookie: string, options: Parameters<typeof app.inject>[0]) {
  return app.inject(withAuth(cookie, options));
}

describe("pipeline integration (mock provider)", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];
  let pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"];
  let authCookie = "";
  let imageId = "";

  beforeEach(async () => {
    const setup = await createTestServer();
    app = setup.app;
    pipeline = setup.pipeline;
    authCookie = setup.authCookie;
    imageId = await createAuthenticatedTestImage(app, authCookie, PNG_1X1);
  });

  afterEach(async () => {
    await app.close();
  });

  it("persists the full mock workflow through Ready without external AI or browser validation", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    expect(createResponse.statusCode).toBe(202);
    const generationId = createResponse.json().generationId as string;

    await waitForGenerationStatus(async () => {
      const response = await authed(app, authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json() as { status: string; awaitingPlanConfirmation?: boolean };
    }, "Planning");

    await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/confirm-plan`,
      payload: { plan: generationPlanFixture },
    });

    await waitForGenerationStatus(async () => {
      const response = await authed(app, authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json() as { status: string };
    }, "Ready");

    const finalStatus = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    expect(finalStatus.json().status).toBe("Ready");
    expect(finalStatus.json().outputs.generatedProject).not.toBeNull();
    expect(finalStatus.json().outputs.designAnalysis).not.toBeNull();
    expect(finalStatus.json().outputs.generationPlan).not.toBeNull();
    expect(finalStatus.json().activeVersionId).toEqual(expect.any(String));
    expect(finalStatus.json().activeVersionNumber).toBe(1);
    expect(finalStatus.json().exportAllowed).toBe(true);
    expect(finalStatus.json().editAllowed).toBe(true);
    expect(finalStatus.json().visualComparisonAllowed).toBe(true);
    expect(finalStatus.json().sandboxValidation).toMatchObject({
      compilation: { success: true },
      runtime: { success: true },
    });

    const record = pipeline.store.get(generationId);
    expect(record?.versions).toHaveLength(1);
    expect(record?.activeVersionId).toBe(record?.versions[0]?.versionId);
    expect(record?.versions[0]).toMatchObject({
      source: "initial_generation",
      projectHash: record?.projectHash,
    });

    const files = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/files`,
    });
    expect(files.statusCode).toBe(200);
    expect(files.json().files.length).toBeGreaterThan(0);

    const exportResponse = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {},
    });
    expect(exportResponse.statusCode).toBe(201);
  });
});
