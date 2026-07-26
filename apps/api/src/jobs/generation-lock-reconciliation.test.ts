import { describe, expect, it } from "vitest";
import type { GenerationRecord } from "../pipeline/types.js";
import { reconcileGenerationLocksSync } from "./generation-lock-reconciliation.js";

function createRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  return {
    id: "gen-1",
    imageId: "img-1",
    projectId: "proj-1",
    status: "Ready",
    activeStage: null,
    stages: [],
    outputs: { designAnalysis: null, generationPlan: null, generatedProject: null },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: null,
    staticValidation: null,
    sandboxValidation: null,
    projectHash: "hash",
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
    awaitingSandboxValidation: false,
    pipelineState: null,
    resumeInProgress: false,
    sandboxResumeInProgress: false,
    errors: [],
    cancelled: false,
    exports: [],
    exportInProgress: false,
    versions: [],
    activeVersionId: "hash",
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
  } as GenerationRecord;
}

describe("reconcileGenerationLocksSync", () => {
  const config = { editLockTimeoutMs: 60_000, visualCaptureTimeoutMs: 120_000 };

  it("clears editInProgress when active edit is completed", () => {
    const record = createRecord({
      editInProgress: true,
      activeEditId: "edit-1",
      edits: [
        {
          editId: "edit-1",
          generationId: "gen-1",
          status: "completed",
          instruction: "test",
          sourceVersionId: "hash",
          projectHashBefore: "hash",
          changedFiles: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(true);
    expect(record.editInProgress).toBe(false);
    expect(record.activeEditId).toBeNull();
  });

  it("clears editInProgress when active edit is cancelled and restores Ready", () => {
    const record = createRecord({
      status: "Generating",
      editInProgress: true,
      activeEditId: "edit-1",
      outputs: { designAnalysis: null, generationPlan: null, generatedProject: { schemaVersion: "1" } as never },
      edits: [
        {
          editId: "edit-1",
          generationId: "gen-1",
          status: "cancelled",
          instruction: "test",
          sourceVersionId: "hash",
          projectHashBefore: "hash",
          changedFiles: [],
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(true);
    expect(record.editInProgress).toBe(false);
    expect(record.status).toBe("Ready");
  });

  it("restores Ready when status is Generating with clarification_required and no edit lock", () => {
    const record = createRecord({
      status: "Generating",
      editInProgress: false,
      activeEditId: "edit-1",
      outputs: { designAnalysis: null, generationPlan: null, generatedProject: { schemaVersion: "1" } as never },
      edits: [
        {
          editId: "edit-1",
          generationId: "gen-1",
          status: "clarification_required",
          instruction: "test",
          sourceVersionId: "hash",
          projectHashBefore: "hash",
          changedFiles: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(true);
    expect(record.status).toBe("Ready");
    expect(record.editInProgress).toBe(false);
  });

  it("clears stale export locks when a ready export supersedes preparing exports", () => {
    const record = createRecord({
      exportInProgress: true,
      exports: [
        {
          exportId: "ready-1",
          status: "ready",
          filename: "demo.zip",
          projectName: "demo",
          generationId: "gen-1",
          versionId: "hash",
          versionNumber: 1,
          projectHash: "hash",
          fileCount: 3,
          totalSizeBytes: 100,
          createdAt: new Date().toISOString(),
          idempotencyFingerprint: "fp-1",
        },
        {
          exportId: "prep-1",
          status: "preparing",
          filename: "demo.zip",
          projectName: "demo",
          generationId: "gen-1",
          versionId: "hash",
          versionNumber: 1,
          projectHash: "hash",
          fileCount: 0,
          totalSizeBytes: 0,
          createdAt: new Date().toISOString(),
          idempotencyFingerprint: "fp-1",
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(true);
    expect(record.exportInProgress).toBe(false);
    expect(record.exports.find((entry) => entry.exportId === "prep-1")?.status).toBe("failed");
  });

  it("keeps editInProgress for a genuinely running edit inside timeout", () => {
    const record = createRecord({
      editInProgress: true,
      activeEditId: "edit-1",
      edits: [
        {
          editId: "edit-1",
          generationId: "gen-1",
          status: "analyzing",
          instruction: "test",
          sourceVersionId: "hash",
          projectHashBefore: "hash",
          changedFiles: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(false);
    expect(record.editInProgress).toBe(true);
  });

  it("does not fail an analyzing edit based on elapsed time without checking its job", () => {
    const record = createRecord({
      editInProgress: true,
      activeEditId: "edit-1",
      edits: [
        {
          editId: "edit-1",
          generationId: "gen-1",
          status: "analyzing",
          instruction: "test",
          sourceVersionId: "hash",
          projectHashBefore: "hash",
          changedFiles: [],
          createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(false);
    expect(record.edits[0]?.status).toBe("analyzing");
    expect(record.editInProgress).toBe(true);
  });

  it("fails awaiting_capture comparisons after timeout", () => {
    const record = createRecord({
      visualComparisonInProgress: true,
      previewCaptureRequired: true,
      activeComparisonId: "cmp-1",
      visualComparisons: [
        {
          comparisonId: "cmp-1",
          generationId: "gen-1",
          versionId: "hash",
          projectHash: "hash",
          status: "awaiting_capture",
          sourceImage: { width: 0, height: 0 },
          previewImage: { width: 0, height: 0 },
          viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
          overallSimilarityScore: 0,
          pixelDifferencePercentage: 0,
          structuralDifferenceScore: 0,
          regions: [],
          summary: "Awaiting preview screenshot capture.",
          correctionRecommended: false,
          createdAt: new Date(Date.now() - 300_000).toISOString(),
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(true);
    expect(record.visualComparisonInProgress).toBe(false);
    expect(record.previewCaptureRequired).toBe(false);
    expect(record.visualComparisons[0]?.status).toBe("failed");
  });

  it("fails every abandoned capture even when no comparison lock points to it", () => {
    const record = createRecord({
      visualComparisonInProgress: false,
      previewCaptureRequired: false,
      activeComparisonId: null,
      visualComparisons: [
        {
          comparisonId: "cmp-old",
          generationId: "gen-1",
          versionId: "hash",
          projectHash: "hash",
          viewport: { width: 1440, height: 800, deviceScaleFactor: 1 },
          status: "awaiting_capture",
          overallSimilarityScore: 0,
          pixelDifferencePercentage: 0,
          structuralDifferenceScore: 0,
          regions: [],
          summary: "Awaiting capture",
          correctionRecommended: false,
          sourceImage: "source",
          previewImage: "preview",
          createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        },
      ],
    });

    expect(reconcileGenerationLocksSync(record, config)).toBe(true);
    expect(record.visualComparisons[0]?.status).toBe("failed");
    expect(record.visualComparisons[0]?.failureReason).toContain("capture timed out");
  });
});
