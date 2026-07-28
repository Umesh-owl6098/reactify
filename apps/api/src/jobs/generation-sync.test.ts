import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { generatedProjectFixture } from "@reactify/test-utils";
import { syncGenerationForJobFailure } from "./generation-sync.js";
import type { GenerationRecord } from "../pipeline/types.js";
import { computeProjectHash } from "../lib/projectHash.js";
import { ensureInitialVersion } from "../lib/edit/versionStore.js";

function createReadyRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  const record: GenerationRecord = {
    id: "924ae008-db1d-44ed-97b7-2019de8b6bf4",
    ownerId: "owner",
    imageId: "image",
    projectId: "project",
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
  ensureInitialVersion(record);
  return record;
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

  it("persists only safe terminal provider metadata for the generation UI", () => {
    const record = createReadyRecord();
    syncGenerationForJobFailure(
      record,
      ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      "react_project_generation",
      "Generated project response failed schema validation.",
      {
        provider: "openai",
        model: "gpt-test",
        httpStatus: 422,
        providerRequestId: "req-safe-123",
        retryable: false,
        validationIssues: [
          {
            path: "files.0.path",
            code: "invalid_type",
            message: "Expected string.",
          },
        ],
      },
    );

    expect(record.errors.at(-1)).toEqual({
      stage: "react_project_generation",
      code: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      message: "Generated project response failed schema validation.",
      provider: "openai",
      model: "gpt-test",
      httpStatus: 422,
      providerRequestId: "req-safe-123",
      retryable: false,
      validationIssues: [
        {
          path: "files.0.path",
          code: "invalid_type",
          message: "Expected string.",
        },
      ],
    });
  });

  it("does not mark the generation Failed when export preparation fails", () => {
    const record = createReadyRecord({
      exportInProgress: true,
      exports: [
        {
          exportId: "8f578d7e-9e57-4efb-90e7-765a9b2678b3",
          status: "preparing",
          filename: "project-v1.zip",
          projectName: "project",
          generationId: "924ae008-db1d-44ed-97b7-2019de8b6bf4",
          versionId: "version-1",
          versionNumber: 1,
          projectHash: "hash",
          fileCount: 0,
          totalSizeBytes: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    syncGenerationForJobFailure(
      record,
      ErrorCode.EXPORT_IN_PROGRESS,
      "export_preparation",
      "Export storage is unavailable.",
    );

    expect(record.status).toBe("Ready");
    expect(record.exportInProgress).toBe(false);
    expect(record.exports[0]).toMatchObject({
      status: "failed",
      failureReason: "Export storage is unavailable.",
    });
  });

  it.each(["edit_intent_analysis", "project_edit_generation"] as const)(
    "makes a failed %s terminal and clears its lock",
    (jobType) => {
      const editId = "c82d02f2-4f74-4db3-b884-ea93738a7044";
      const record = createReadyRecord({
        status: "Generating",
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

  it("does not restore Ready after edit recovery without a valid active snapshot", () => {
    const record = createReadyRecord({
      status: "Generating",
      editInProgress: true,
      activeEditId: "edit-1",
      edits: [
        {
          editId: "edit-1",
          generationId: "924ae008-db1d-44ed-97b7-2019de8b6bf4",
          status: "generating_patch",
          instruction: "Change one visual property.",
          sourceVersionId: "missing-version",
          projectHashBefore: computeProjectHash(generatedProjectFixture),
          changedFiles: [],
          clarificationAnswers: [],
          clarificationRound: 0,
          resolvedInstruction: "Change one visual property.",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    record.activeVersionId = "missing-version";

    syncGenerationForJobFailure(record, ErrorCode.INTERNAL_ERROR, "project_edit_generation");
    expect(record.status).toBe("Generating");
  });
});
