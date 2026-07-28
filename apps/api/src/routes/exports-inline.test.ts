import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { ensureInitialVersion } from "../lib/edit/versionStore.js";
import { computeProjectHash } from "../lib/projectHash.js";
import type { GenerationRecord } from "../pipeline/types.js";
import {
  createTestServer,
  withAuth,
  PNG_1X1,
  createAuthenticatedTestImage,
} from "../test/helpers.js";

function authed(app: Awaited<ReturnType<typeof createTestServer>>["app"], cookie: string, options: Parameters<typeof app.inject>[0]) {
  return app.inject(withAuth(cookie, options));
}

function createReadyRecord(input: {
  generationId: string;
  ownerId: string;
  imageId: string;
}): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  const record: GenerationRecord = {
    id: input.generationId,
    ownerId: input.ownerId,
    imageId: input.imageId,
    projectId: randomUUID(),
    status: "Ready",
    activeStage: null,
    stages: [],
    outputs: {
      designAnalysis: null,
      generationPlan: null,
      generatedProject: generatedProjectFixture,
    },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: { valid: true, errors: [] },
    staticValidation: { valid: true, errors: [], warnings: [] },
    sandboxValidation: {
      projectHash,
      compilation: { success: true, durationMs: 120, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 120, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    },
    projectHash,
    validationReportFingerprint: "fingerprint",
    repairRequired: false,
    repairStatus: "succeeded",
    currentRepairAttempt: 0,
    maxRepairAttempts: 3,
    repairAttempts: [],
    repairInProgress: false,
    manualRetryAllowed: false,
    editedByUser: false,
    confirmedAt: new Date().toISOString(),
    awaitingPlanConfirmation: false,
    awaitingSandboxValidation: false,
    pipelineState: null,
    resumeInProgress: false,
    sandboxResumeInProgress: false,
    errors: [],
    cancelled: false,
    exports: [],
    exportInProgress: false,
    versions: [],
    activeVersionId: null,
    edits: [],
    editInProgress: false,
    activeEditId: null,
    rollbackInProgress: false,
    visualComparisons: [],
    visualComparisonInProgress: false,
    activeComparisonId: null,
    visualCorrectionInProgress: false,
    visualCorrectionAttempt: 0,
    visualCorrectionMaxAttempts: 3,
    previewCaptureRequired: false,
    pendingVisualRecomparison: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureInitialVersion(record);
  return record;
}

async function seedReadyGeneration(
  pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"],
  ownerId: string,
  imageId: string,
) {
  const generationId = randomUUID();
  const record = createReadyRecord({ generationId, ownerId, imageId });
  pipeline.store.hydrate([record]);
  await pipeline.store.persist(record);
  return generationId;
}

async function waitForExportStatus(
  app: Awaited<ReturnType<typeof createTestServer>>["app"],
  authCookie: string,
  generationId: string,
  exportId: string,
  expected: "ready" | "failed",
  timeoutMs = 15_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await authed(app, authCookie, {
      method: "GET",
      url: `/api/v1/generations/${generationId}/exports/${exportId}`,
    });
    expect(response.statusCode).toBe(200);
    const status = response.json().export.status as string;
    if (status === expected) {
      return response.json();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for export status "${expected}"`);
}

describe("export inline execution integration", () => {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const canUseDatabase = Boolean(databaseUrl);

  describe.runIf(canUseDatabase)("with persistence", () => {
    let app: Awaited<ReturnType<typeof createTestServer>>["app"];
    let pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"];
    let authCookie = "";
    let userId = "";
    let imageId = "";

    describe("JOB_INLINE_EXECUTION=true without worker polling", () => {
      beforeEach(async () => {
        const setup = await createTestServer({
          useDatabase: true,
          startWorker: false,
          pipelineEnv: { JOB_INLINE_EXECUTION: true },
        });
        app = setup.app;
        pipeline = setup.pipeline;
        authCookie = setup.authCookie;
        userId = setup.userId;
        imageId = await createAuthenticatedTestImage(app, authCookie, PNG_1X1);
      });

      afterEach(async () => {
        await app.close();
      });

      it("prepares export inline in the API process and returns a downloadable ZIP", async () => {
        const generationId = await seedReadyGeneration(pipeline, userId, imageId);

        const exportResponse = await authed(app, authCookie, {
          method: "POST",
          url: `/api/v1/generations/${generationId}/exports`,
          payload: {},
        });

        expect(exportResponse.statusCode).toBe(202);
        const body = exportResponse.json() as { export: { exportId: string; status: string }; job: { jobId: string } };
        expect(body.export.status).toBe("ready");
        expect(body.job.jobId).toEqual(expect.any(String));

        const download = await authed(app, authCookie, {
          method: "GET",
          url: `/api/v1/generations/${generationId}/exports/${body.export.exportId}/download`,
        });

        expect(download.statusCode).toBe(200);
        expect(download.headers["content-type"]).toBe("application/zip");
        expect(download.rawPayload.subarray(0, 2).toString()).toBe("PK");
      });
    });

    describe("JOB_INLINE_EXECUTION=false with background worker", () => {
      beforeEach(async () => {
        const setup = await createTestServer({
          useDatabase: true,
          startWorker: true,
          pipelineEnv: {
            JOB_INLINE_EXECUTION: false,
            JOB_WORKER_POLL_INTERVAL_MS: 100,
          },
        });
        app = setup.app;
        pipeline = setup.pipeline;
        authCookie = setup.authCookie;
        userId = setup.userId;
        imageId = await createAuthenticatedTestImage(app, authCookie, PNG_1X1);
        setup.jobs?.jobRunner.start();
      });

      afterEach(async () => {
        await app.close();
      });

      it("queues export_preparation for the worker and becomes ready asynchronously", async () => {
        const generationId = await seedReadyGeneration(pipeline, userId, imageId);

        const exportResponse = await authed(app, authCookie, {
          method: "POST",
          url: `/api/v1/generations/${generationId}/exports`,
          payload: {},
        });

        expect(exportResponse.statusCode).toBe(202);
        const body = exportResponse.json() as { export: { exportId: string; status: string }; job: { jobId: string } };
        expect(body.export.status).toBe("preparing");

        const readyDetail = await waitForExportStatus(app, authCookie, generationId, body.export.exportId, "ready");
        expect(readyDetail.export.status).toBe("ready");

        const download = await authed(app, authCookie, {
          method: "GET",
          url: `/api/v1/generations/${generationId}/exports/${body.export.exportId}/download`,
        });

        expect(download.statusCode).toBe(200);
        expect(download.rawPayload.subarray(0, 2).toString()).toBe("PK");
      });
    });
  });
});
