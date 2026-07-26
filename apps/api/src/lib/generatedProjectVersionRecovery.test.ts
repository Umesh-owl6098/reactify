import { describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { computeProjectHash } from "./projectHash.js";
import { recoverMissingInitialVersion } from "./generatedProjectVersionRecovery.js";
import type { GenerationRecord } from "../pipeline/types.js";

function buildRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const now = new Date().toISOString();
  const projectHash = computeProjectHash(generatedProjectFixture);
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "44444444-4444-4444-8444-444444444444",
    imageId: "22222222-2222-4222-8222-222222222222",
    projectId: "33333333-3333-4333-8333-333333333333",
    status: "Compiling",
    activeStage: "sandbox_compilation",
    stages: [],
    outputs: { designAnalysis: null, generationPlan: null, generatedProject: null },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: null,
    staticValidation: null,
    sandboxValidation: null,
    projectHash,
    validationReportFingerprint: null,
    repairRequired: false,
    repairStatus: "not_required",
    currentRepairAttempt: 0,
    maxRepairAttempts: 3,
    repairAttempts: [],
    repairInProgress: false,
    manualRetryAllowed: false,
    editedByUser: false,
    confirmedAt: null,
    awaitingPlanConfirmation: false,
    awaitingSandboxValidation: true,
    pipelineState: {
      imageId: "22222222-2222-4222-8222-222222222222",
      generatedProject: generatedProjectFixture,
      projectHash,
      awaitingSandboxValidation: true,
    },
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
    stateVersion: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("recoverMissingInitialVersion", () => {
  it("creates the initial version for stuck compiling generations", () => {
    const record = buildRecord();
    expect(recoverMissingInitialVersion(record)).toBe(true);
    expect(record.activeVersionId).toBe(record.projectHash);
    expect(record.versions).toHaveLength(1);
    expect(record.outputs.generatedProject).not.toBeNull();
  });

  it("is idempotent when a version already exists", () => {
    const record = buildRecord();
    expect(recoverMissingInitialVersion(record)).toBe(true);
    const versionCount = record.versions.length;
    const activeVersionId = record.activeVersionId;
    expect(recoverMissingInitialVersion(record)).toBe(false);
    expect(record.versions).toHaveLength(versionCount);
    expect(record.activeVersionId).toBe(activeVersionId);
  });

  it("does not recover when pipelineState.generatedProject is missing", () => {
    const record = buildRecord({ pipelineState: { imageId: "22222222-2222-4222-8222-222222222222" } });
    expect(recoverMissingInitialVersion(record)).toBe(false);
  });
});
