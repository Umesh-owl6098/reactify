import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { syncGenerationForJobFailure } from "./generation-sync.js";
import type { GenerationRecord } from "../pipeline/types.js";

function createReadyRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  return {
    id: "924ae008-db1d-44ed-97b7-2019de8b6bf4",
    ownerId: "owner",
    imageId: "image",
    projectId: "project",
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
}

describe("syncGenerationForJobFailure", () => {
  it("marks pipeline job failures as generation Failed", () => {
    const record = createReadyRecord();
    syncGenerationForJobFailure(record, ErrorCode.INTERNAL_ERROR, "design_analysis");
    expect(record.status).toBe("Failed");
  });

  it("persists the terminal job failure code and message for the generation UI", () => {
    const record = createReadyRecord();
    syncGenerationForJobFailure(
      record,
      ErrorCode.AI_TIMEOUT,
      "design_analysis",
      "The AI provider did not respond before the deadline.",
    );

    expect(record.errors).toEqual([
      {
        stage: "design_analysis",
        code: ErrorCode.AI_TIMEOUT,
        message: "The AI provider did not respond before the deadline.",
      },
    ]);
  });

  it("does not mark the generation Failed when export preparation fails", () => {
    const record = createReadyRecord();
    syncGenerationForJobFailure(record, ErrorCode.EXPORT_IN_PROGRESS, "export_preparation");
    expect(record.status).toBe("Ready");
  });

  it.each(["edit_intent_analysis", "project_edit_generation"] as const)(
    "makes a failed %s terminal and clears its lock",
    (jobType) => {
      const editId = "c82d02f2-4f74-4db3-b884-ea93738a7044";
      const record = createReadyRecord({
        status: "Generating",
        outputs: {
          designAnalysis: null,
          generationPlan: null,
          generatedProject: { schemaVersion: "1", summary: "project", files: [], components: [] },
        },
        editInProgress: true,
        activeEditId: editId,
        edits: [
          {
            editId,
            generationId: "924ae008-db1d-44ed-97b7-2019de8b6bf4",
            status: "generating_patch",
            instruction: "Change one visual property.",
            sourceVersionId: "version-1",
            projectHashBefore: "hash",
            changedFiles: [],
            clarificationAnswers: [],
            clarificationRound: 0,
            idempotencyFingerprint: "fingerprint",
            resolvedInstruction: "Change one visual property.",
            createdAt: new Date().toISOString(),
          },
        ],
      });

      syncGenerationForJobFailure(record, ErrorCode.INTERNAL_ERROR, jobType);

      expect(record.edits[0]?.status).toBe("failed");
      expect(record.edits[0]?.completedAt).toBeTruthy();
      expect(record.editInProgress).toBe(false);
      expect(record.activeEditId).toBeNull();
      expect(record.status).toBe("Ready");
    },
  );
});
