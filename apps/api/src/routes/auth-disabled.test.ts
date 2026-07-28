import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { DEFAULT_DEMO_USER_ID } from "@reactify/shared";
import { ensureInitialVersion } from "../lib/edit/versionStore.js";
import { computeProjectHash } from "../lib/projectHash.js";
import type { GenerationRecord } from "../pipeline/types.js";
import {
  createTestServer,
  PNG_1X1,
} from "../test/helpers.js";
import { createAnonymousTestImage, withOrigin } from "../test/anonymousHelpers.js";

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

describe("auth disabled API integration", () => {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const canUseDatabase = Boolean(databaseUrl);

  describe.runIf(canUseDatabase)("with persistence", () => {
    let app: Awaited<ReturnType<typeof createTestServer>>["app"];
    let pipeline: Awaited<ReturnType<typeof createTestServer>>["pipeline"];

    beforeEach(async () => {
      const setup = await createTestServer({
        useDatabase: true,
        pipelineEnv: { AUTH_MODE: "disabled" },
      });
      app = setup.app;
      pipeline = setup.pipeline;
    });

    afterEach(async () => {
      await app.close();
    });

    it("returns a demo session without cookies", async () => {
      const response = await app.inject(withOrigin({
        method: "GET",
        url: "/api/v1/auth/session",
      }));
      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(true);
      expect(response.json().user.displayName).toBe("Demo User");
    });

    it("rejects register and sign-in when auth is disabled", async () => {
      const register = await app.inject(withOrigin({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: `disabled-${randomUUID()}@example.com`,
          password: "secure-password-123",
          displayName: "Disabled Auth",
        },
      }));
      expect(register.statusCode).toBe(403);

      const signIn = await app.inject(withOrigin({
        method: "POST",
        url: "/api/v1/auth/sign-in",
        payload: {
          email: "demo@reactify.local",
          password: "secure-password-123",
        },
      }));
      expect(signIn.statusCode).toBe(403);
    });

    it("uploads images, lists history, exports, and edits without session cookies", async () => {
      const imageId = await createAnonymousTestImage(app, PNG_1X1);
      const generationId = randomUUID();
      const demoUserId = DEFAULT_DEMO_USER_ID;
      const record = createReadyRecord({ generationId, ownerId: demoUserId, imageId });
      pipeline.store.hydrate([record]);
      await pipeline.store.persist(record);

      const history = await app.inject(withOrigin({
        method: "GET",
        url: "/api/v1/generations",
      }));
      expect(history.statusCode).toBe(200);
      expect(history.json().total).toBeGreaterThan(0);

      const exportResponse = await app.inject(withOrigin({
        method: "POST",
        url: `/api/v1/generations/${generationId}/exports`,
        payload: {},
      }));
      expect(exportResponse.statusCode).toBe(202);

      const editResponse = await app.inject(withOrigin({
        method: "POST",
        url: `/api/v1/generations/${generationId}/edits`,
        payload: { instruction: "Make the hero headline larger." },
      }));
      expect([202, 409, 422]).toContain(editResponse.statusCode);
    });
  });
});
