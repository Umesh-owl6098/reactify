import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  completeSandboxValidation,
  createTestServer,
  waitForGenerationStatus,
  withAuth,
  PNG_1X1,
  createAuthenticatedTestImage,
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
    return response.json() as { status: string };
  }, "Planning");
}

async function confirmPlan(
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
  cookie: string,
  generationId: string,
) {
  const response = await authed(app, cookie, {
    method: "POST",
    url: `/api/v1/generations/${generationId}/confirm-plan`,
    payload: { plan: generationPlanFixture },
  });
  expect(response.statusCode).toBe(200);
}

describe("export routes", () => {
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

  it("creates and downloads an export for a validated project", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);
    await completeSandboxValidation(app, authCookie, generationId, pipeline);

    const blocked = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {},
    });
    expect(blocked.statusCode).toBe(201);

    const status = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });
    expect(status.json().exportAllowed).toBe(true);

    const exportId = blocked.json().exportId as string;
    const download = await authed(app, authCookie, {
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
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);
    await completeSandboxValidation(app, authCookie, generationId, pipeline);

    const response = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {
        projectName: "MockLandingPage",
        includeMetadata: true,
        includeGenerationSummary: false,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().projectName).toBe("mocklandingpage");
  });

  it("rejects export when project is not ready", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;

    const response = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {},
    });

    expect(response.statusCode).toBe(409);
  });

  it("lists export history", async () => {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    const generationId = createResponse.json().generationId as string;
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);
    await completeSandboxValidation(app, authCookie, generationId, pipeline);

    await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      payload: {},
    });

    const history = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/exports`,
    });

    expect(history.statusCode).toBe(200);
    expect(history.json().exports.length).toBeGreaterThan(0);
  });
});
