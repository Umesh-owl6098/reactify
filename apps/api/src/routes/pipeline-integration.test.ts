import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  createTestServer,
  completeSandboxValidation,
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

  it("runs upload through preview-ready without live Anthropic calls", async () => {
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

    await completeSandboxValidation(app, authCookie, generationId, pipeline);

    const finalStatus = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    expect(finalStatus.json().status).toBe("Ready");
    expect(finalStatus.json().outputs.generatedProject).not.toBeNull();
    expect(finalStatus.json().outputs.designAnalysis).not.toBeNull();
    expect(finalStatus.json().outputs.generationPlan).not.toBeNull();
  });
});
