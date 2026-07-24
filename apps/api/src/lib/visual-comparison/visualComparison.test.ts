import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  createVisualCorrectionFixtureJson,
  generatedProjectFixture,
  MockAIProvider,
} from "@reactify/test-utils";
import type { GenerationRecord } from "../../pipeline/types.js";
import { computeProjectHash } from "../projectHash.js";
import { evaluateVisualComparisonEligibility } from "./visualComparisonEligibility.js";
import { VisualComparisonService } from "./VisualComparisonService.js";
import { ComparisonArtifactStore } from "./comparisonArtifactStore.js";
import { ImageStorage } from "../imageStorage.js";
import { ensureInitialVersion } from "../edit/versionStore.js";
import { defaultLoadPrompt } from "../../prompts/loader.js";
import { testEnv, PNG_1X1 } from "../../test/helpers.js";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createReadyRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  const record: GenerationRecord = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    imageId: "660e8400-e29b-41d4-a716-446655440000",
    projectId: "770e8400-e29b-41d4-a716-446655440000",
    status: "Ready",
    activeStage: null,
    stages: [],
    outputs: { designAnalysis: null, generationPlan: null, generatedProject: generatedProjectFixture },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: { valid: true, errors: [] },
    staticValidation: { valid: true, errors: [], warnings: [] },
    sandboxValidation: {
      projectHash,
      compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    },
    projectHash,
    validationReportFingerprint: "fingerprint",
    repairRequired: false,
    repairStatus: "not_required",
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
    ...overrides,
  };
  ensureInitialVersion(record);
  return record;
}

async function createPreviewPngBase64(): Promise<string> {
  const buffer = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  return buffer.toString("base64");
}

describe("visualComparisonEligibility", () => {
  it("allows comparison for preview-ready projects", () => {
    expect(evaluateVisualComparisonEligibility(createReadyRecord()).ok).toBe(true);
  });

  it("blocks when preview is not ready", () => {
    expect(evaluateVisualComparisonEligibility(createReadyRecord({ status: "Compiling" })).ok).toBe(false);
  });
});

describe("VisualComparisonService", () => {
  it("creates and completes a visual comparison from screenshot submission", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reactify-visual-test-"));
    const imageStorage = new ImageStorage(storageDir);
    await imageStorage.ensureReady();
    const stored = await imageStorage.save(PNG_1X1, "image/png");

    const artifactStore = new ComparisonArtifactStore(await mkdtemp(join(tmpdir(), "reactify-artifacts-")));
    await artifactStore.ensureReady();

    const service = VisualComparisonService.fromDeps({
      aiProvider: new MockAIProvider(),
      loadPrompt: defaultLoadPrompt,
      env: testEnv,
      imageStorage,
      artifactStore,
    });

    const record = createReadyRecord({ imageId: stored.imageId });
    const createResult = await service.createComparison(record, {
      expectedProjectHash: record.projectHash!,
      viewport: { width: 200, height: 200, deviceScaleFactor: 1 },
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) {
      return;
    }

    const screenshotResult = await service.submitScreenshot(record, createResult.comparison.comparisonId, {
      expectedProjectHash: record.projectHash!,
      viewport: { width: 200, height: 200, deviceScaleFactor: 1 },
      imageFormat: "png",
      screenshotBase64: await createPreviewPngBase64(),
      capturedAt: new Date().toISOString(),
    });

    expect(screenshotResult.ok).toBe(true);
    if (!screenshotResult.ok) {
      return;
    }
    expect(["completed", "correction_available"]).toContain(screenshotResult.comparison.status);
    expect(screenshotResult.comparison.overallSimilarityScore).toBeGreaterThan(0);
  });

  it("applies a visual correction and creates a new version", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reactify-visual-test-"));
    const imageStorage = new ImageStorage(storageDir);
    await imageStorage.ensureReady();
    const stored = await imageStorage.save(PNG_1X1, "image/png");
    const artifactStore = new ComparisonArtifactStore(await mkdtemp(join(tmpdir(), "reactify-artifacts-")));
    await artifactStore.ensureReady();

    const aiProvider = new MockAIProvider({ responses: [createVisualCorrectionFixtureJson()] });
    const service = VisualComparisonService.fromDeps({
      aiProvider,
      loadPrompt: defaultLoadPrompt,
      env: testEnv,
      imageStorage,
      artifactStore,
    });

    const record = createReadyRecord({ imageId: stored.imageId });
    const createResult = await service.createComparison(record, {
      expectedProjectHash: record.projectHash!,
      viewport: { width: 200, height: 200, deviceScaleFactor: 1 },
    });
    if (!createResult.ok) {
      throw new Error("create failed");
    }

    const screenshotResult = await service.submitScreenshot(record, createResult.comparison.comparisonId, {
      expectedProjectHash: record.projectHash!,
      viewport: { width: 200, height: 200, deviceScaleFactor: 1 },
      imageFormat: "png",
      screenshotBase64: await createPreviewPngBase64(),
      capturedAt: new Date().toISOString(),
    });
    if (!screenshotResult.ok) {
      throw new Error("screenshot failed");
    }

    const comparison = record.visualComparisons.find(
      (entry) => entry.comparisonId === createResult.comparison.comparisonId,
    );
    if (comparison) {
      comparison.status = "correction_available";
      comparison.correctionRecommended = true;
    }

    const correctionResult = await service.applyCorrection(record, createResult.comparison.comparisonId, {
      expectedProjectHash: record.projectHash!,
    });
    expect(correctionResult.ok).toBe(true);
    if (correctionResult.ok) {
      expect(record.versions.some((version) => version.source === "visual_correction")).toBe(true);
      expect(record.awaitingSandboxValidation).toBe(true);
    }
  });
});
