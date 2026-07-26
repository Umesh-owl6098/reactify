import { describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import type { GenerationRecord } from "../../pipeline/types.js";
import { evaluateExportEligibility, getActiveProjectVersion } from "./exportEligibility.js";
import { computeProjectHash } from "../projectHash.js";
import { ensureInitialVersion } from "../edit/versionStore.js";

function createReadyRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
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
}

describe("exportEligibility", () => {
  it("allows export for a validated preview-ready project", () => {
    const result = evaluateExportEligibility(createReadyRecord());
    expect(result.ok).toBe(true);
  });

  it("uses the active version snapshot when version history exists", () => {
    const record = createReadyRecord();
    ensureInitialVersion(record);
    const result = evaluateExportEligibility(record);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(getActiveProjectVersion(record)?.versionId).toBe(record.activeVersionId);
    expect(result.version.versionId).toBe(record.activeVersionId);
  });

  it("blocks export when version history exists without an active version", () => {
    const record = createReadyRecord();
    record.versions.push({
      versionId: record.projectHash!,
      versionNumber: 1,
      source: "initial_generation",
      label: "Initial generated project",
      parentVersionId: null,
      projectHash: record.projectHash!,
      project: structuredClone(generatedProjectFixture),
      changedFiles: [],
      createdAt: new Date().toISOString(),
    });
    record.activeVersionId = null;
    const result = evaluateExportEligibility(record);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("active_version_not_found");
    }
  });

  it("blocks export while awaiting sandbox validation", () => {
    const result = evaluateExportEligibility(createReadyRecord({ awaitingSandboxValidation: true, status: "Compiling" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("awaiting_sandbox_validation");
    }
  });

  it("blocks export when compilation failed", () => {
    const record = createReadyRecord();
    record.sandboxValidation = {
      ...record.sandboxValidation!,
      compilation: { success: false, durationMs: 1, errors: [], warnings: [] },
    };
    const result = evaluateExportEligibility(record);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("project_not_validated");
    }
  });

  it("blocks export while repair is running", () => {
    const result = evaluateExportEligibility(createReadyRecord({ repairInProgress: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("repair_in_progress");
    }
  });

  it("blocks export for cancelled generations", () => {
    const result = evaluateExportEligibility(createReadyRecord({ cancelled: true, status: "Cancelled" }));
    expect(result.ok).toBe(false);
  });

  it("blocks export when project hash mismatches", () => {
    const result = evaluateExportEligibility(createReadyRecord({ projectHash: "deadbeef".repeat(8) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("project_integrity_failed");
    }
  });

  it("blocks export for repair failed generations", () => {
    const result = evaluateExportEligibility(createReadyRecord({ status: "RepairFailed" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("repair_failed");
    }
  });

  it("blocks export when active version is missing", () => {
    const result = evaluateExportEligibility(createReadyRecord({ projectHash: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("active_version_not_found");
    }
  });

  it("blocks export when generated project is missing", () => {
    const record = createReadyRecord();
    record.outputs.generatedProject = null;
    const result = evaluateExportEligibility(record);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("project_not_found");
    }
  });

  it("blocks export when export is already in progress", () => {
    const result = evaluateExportEligibility(
      createReadyRecord({
        exportInProgress: true,
        exports: [
          {
            exportId: "880e8400-e29b-41d4-a716-446655440000",
            status: "preparing",
            filename: "mocklandingpage-v1.zip",
            projectName: "mocklandingpage",
            generationId: "550e8400-e29b-41d4-a716-446655440000",
            versionId: computeProjectHash(generatedProjectFixture),
            versionNumber: 1,
            projectHash: computeProjectHash(generatedProjectFixture),
            fileCount: 0,
            totalSizeBytes: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("export_in_progress");
    }
  });

  it("clears stale exportInProgress flags without a preparing export", () => {
    const record = createReadyRecord({ exportInProgress: true });
    const result = evaluateExportEligibility(record);
    expect(result.ok).toBe(true);
    expect(record.exportInProgress).toBe(false);
  });

  it("allows the active export preparation job to proceed while export is in progress", () => {
    const exportId = "880e8400-e29b-41d4-a716-446655440000";
    const record = createReadyRecord({
      exportInProgress: true,
      exports: [
        {
          exportId,
          status: "preparing",
          filename: "mocklandingpage-v1.zip",
          projectName: "mocklandingpage",
          generationId: "550e8400-e29b-41d4-a716-446655440000",
          versionId: computeProjectHash(generatedProjectFixture),
          versionNumber: 1,
          projectHash: computeProjectHash(generatedProjectFixture),
          fileCount: 0,
          totalSizeBytes: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const result = evaluateExportEligibility(record, { activeExportId: exportId });
    expect(result.ok).toBe(true);
  });
});
