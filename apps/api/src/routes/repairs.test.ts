import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationPlanFixture } from "@reactify/test-utils";
import {
  createFailedCompilationSandboxValidationReport,
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

async function confirmPlan(app: Awaited<ReturnType<typeof createTestServer>>["app"], generationId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/generations/${generationId}/confirm-plan`,
    payload: { plan: generationPlanFixture },
  });
  expect(response.statusCode).toBe(200);
}

describe("repair routes", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];
  let imageId = "";

  beforeEach(async () => {
    const setup = await createTestServer();
    app = setup.app;
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

  it("returns repair history and attempt detail without raw AI output", async () => {
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
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
    );

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}/repairs`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().attempts).toHaveLength(1);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}/repairs/1`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().attempt.patchSummary).toBeTruthy();
    expect(JSON.stringify(detail.json())).not.toContain("ANTHROPIC");
    expect(JSON.stringify(detail.json())).not.toContain("You are repairing a generated React");
  });

  it("includes repair status in generation polling", async () => {
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
      createFailedCompilationSandboxValidationReport({ generationId, projectHash }),
    );

    const status = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });

    expect(status.json().repair).toMatchObject({
      repairRequired: true,
      currentAttempt: 1,
      maxAttempts: 3,
      clientRevalidationRequired: true,
    });
  });

  it("rejects manual retry in invalid state", async () => {
    const generationId = await startGeneration();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/repairs/retry`,
    });
    expect(response.statusCode).toBe(409);
  });
});
