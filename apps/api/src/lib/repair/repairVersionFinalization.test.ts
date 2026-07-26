import { describe, expect, it } from "vitest";
import { generatedProjectFixture, projectPatchFixture } from "@reactify/test-utils";
import type { GenerationRecord } from "../../pipeline/types.js";
import { computeProjectHash } from "../projectHash.js";
import { createProjectVersion, ensureInitialVersion } from "../edit/versionStore.js";
import { evaluateExportEligibility } from "../export/exportEligibility.js";
import { applyProjectPatch } from "./patchApplicator.js";
import {
  finalizeValidatedRepairVersion,
  recoverStaleRepairVersionIntegrity,
} from "./repairVersionFinalization.js";

function createReadyRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  const now = new Date().toISOString();
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    ownerId: "44444444-4444-4444-8444-444444444444",
    imageId: "660e8400-e29b-41d4-a716-446655440000",
    projectId: "770e8400-e29b-41d4-a716-446655440000",
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
      compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
      validatedAt: now,
    },
    projectHash,
    validationReportFingerprint: "fingerprint",
    repairRequired: false,
    repairStatus: "succeeded",
    currentRepairAttempt: 1,
    maxRepairAttempts: 3,
    repairAttempts: [
      {
        attemptNumber: 1,
        startedAt: now,
        status: "waiting_for_revalidation",
        changedFiles: [{ path: "src/App.tsx", operation: "modify" }],
        deletedFiles: [],
        dependencyChanges: [],
        projectHashBefore: projectHash,
        projectHashAfter: "pending",
      } as GenerationRecord["repairAttempts"][number],
    ],
    repairInProgress: false,
    manualRetryAllowed: false,
    editedByUser: false,
    confirmedAt: now,
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
    stateVersion: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRepairedProject() {
  const applied = applyProjectPatch(generatedProjectFixture, projectPatchFixture);
  expect(applied.ok).toBe(true);
  if (!applied.ok) {
    throw new Error("Patch apply failed");
  }
  return applied.result;
}

describe("repairVersionFinalization", () => {
  it("creates a new automatic_repair version and enables export eligibility", () => {
    const originalHash = computeProjectHash(generatedProjectFixture);
    const repaired = createRepairedProject();
    const repairedHash = repaired.projectHash;
    expect(repairedHash).not.toBe(originalHash);

    const record = createReadyRecord({
      projectHash: repairedHash,
      sandboxValidation: {
        projectHash: repairedHash,
        compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
        runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
        validatedAt: new Date().toISOString(),
      },
      pipelineState: {
        imageId: "660e8400-e29b-41d4-a716-446655440000",
        generatedProject: repaired.project,
        projectHash: repairedHash,
      },
    });
    ensureInitialVersion(record);
    expect(record.activeVersionId).toBe(originalHash);

    expect(finalizeValidatedRepairVersion(record, repairedHash)).toBe(true);
    expect(record.activeVersionId).not.toBe(originalHash);
    expect(record.activeVersionId).not.toBe(repairedHash);
    expect(record.versions.find((version) => version.versionId === record.activeVersionId)?.projectHash).toBe(
      repairedHash,
    );
    expect(record.versions).toHaveLength(2);
    expect(record.versions[1]?.source).toBe("automatic_repair");
    expect(record.repairAttempts[0]?.status).toBe("succeeded");
    expect(computeProjectHash(record.outputs.generatedProject!)).toBe(repairedHash);
    expect(evaluateExportEligibility(record).ok).toBe(true);
  });

  it("recovers stale integrity for a ready generation with validated repair hash", () => {
    const originalHash = computeProjectHash(generatedProjectFixture);
    const repaired = createRepairedProject();
    const repairedHash = repaired.projectHash;

    const record = createReadyRecord({
      projectHash: repairedHash,
      sandboxValidation: {
        projectHash: repairedHash,
        compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
        runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
        validatedAt: new Date().toISOString(),
      },
      pipelineState: {
        imageId: "660e8400-e29b-41d4-a716-446655440000",
        generatedProject: repaired.project,
        projectHash: repairedHash,
      },
    });
    ensureInitialVersion(record);
    record.activeVersionId = originalHash;
    record.projectHash = repairedHash;
    record.outputs.generatedProject = structuredClone(generatedProjectFixture);

    expect(evaluateExportEligibility(record).ok).toBe(false);
    expect(recoverStaleRepairVersionIntegrity(record)).toBe(true);
    expect(record.versions.find((version) => version.versionId === record.activeVersionId)?.projectHash).toBe(
      repairedHash,
    );
    expect(evaluateExportEligibility(record).ok).toBe(true);
  });

  it("does not reinterpret a validated edit version as a pending repair", () => {
    const record = createReadyRecord({
      currentRepairAttempt: 0,
      repairAttempts: [],
    });
    const initial = ensureInitialVersion(record)!;
    const edited = createProjectVersion({
      record,
      project: generatedProjectFixture,
      source: "natural_language_edit",
      label: "Validated edit",
      parentVersionId: initial.versionId,
    });
    record.projectHash = edited.projectHash;
    record.sandboxValidation = {
      projectHash: edited.projectHash,
      compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    };

    expect(finalizeValidatedRepairVersion(record, edited.projectHash)).toBe(false);
    expect(record.activeVersionId).toBe(edited.versionId);
  });

  it("remains idempotent when the repaired version is already active", () => {
    const repaired = createRepairedProject();
    const repairedHash = repaired.projectHash;
    const record = createReadyRecord({
      projectHash: repairedHash,
      outputs: { designAnalysis: null, generationPlan: null, generatedProject: repaired.project },
      pipelineState: {
        imageId: "660e8400-e29b-41d4-a716-446655440000",
        generatedProject: repaired.project,
        projectHash: repairedHash,
      },
    });
    ensureInitialVersion(record);
    finalizeValidatedRepairVersion(record, repairedHash);
    const versionCount = record.versions.length;
    const activeVersionId = record.activeVersionId;

    expect(finalizeValidatedRepairVersion(record, repairedHash)).toBe(false);
    expect(record.versions).toHaveLength(versionCount);
    expect(record.activeVersionId).toBe(activeVersionId);
  });

  it("computes deterministic hashes regardless of file order", () => {
    const reversed = {
      ...generatedProjectFixture,
      files: [...generatedProjectFixture.files].reverse(),
    };
    expect(computeProjectHash(reversed)).toBe(computeProjectHash(generatedProjectFixture));
  });
});
