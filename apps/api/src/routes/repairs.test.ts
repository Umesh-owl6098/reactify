import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  createFailedCompilationSandboxValidationReport,
  createTestServer,
  submitSandboxValidationReport,
  waitForAwaitingSandboxValidation,
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

describe("repair routes", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];
  let authCookie = "";
  let imageId = "";

  beforeEach(async () => {
    const setup = await createTestServer();
    app = setup.app;
    authCookie = setup.authCookie;
    imageId = await createAuthenticatedTestImage(app, authCookie, PNG_1X1);
  });

  afterEach(async () => {
    await app.close();
  });

  async function startGeneration(): Promise<string> {
    const createResponse = await authed(app, authCookie, {
      method: "POST",
      url: "/api/v1/generations",
      payload: { imageId },
    });
    return createResponse.json().generationId as string;
  }

  it("returns repair history and attempt detail without raw AI output", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await authed(app, authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    await submitSandboxValidationReport(
      app,
      generationId,
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    const history = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/repairs`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().attempts.length).toBeGreaterThan(0);

    const detail = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/repairs/1`,
    });
    expect(detail.statusCode).toBe(200);
    expect(JSON.stringify(detail.json())).not.toMatch(/patchFingerprint|diagnosticsFingerprint/);
  });

  it("includes repair status in generation polling", async () => {
    const generationId = await startGeneration();
    await waitForPlanning(app, authCookie, generationId);
    await confirmPlan(app, authCookie, generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const response = await authed(app, authCookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      });
      return response.json();
    });

    await submitSandboxValidationReport(
      app,
      generationId,
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
      authCookie,
    );

    const status = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    expect(status.json().repairStatus).not.toBe("not_required");
  });

  it("rejects manual retry in invalid state", async () => {
    const generationId = await startGeneration();
    const response = await authed(app, authCookie, {
      method: "POST",
      url: `/api/v1/generations/${generationId}/repairs/retry`,
    });
    expect(response.statusCode).toBe(409);
  });
});
