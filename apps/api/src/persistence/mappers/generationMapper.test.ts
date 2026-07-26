import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { generatedProjectFixture } from "@reactify/test-utils";
import { computeProjectHash } from "../../lib/projectHash.js";
import type { GenerationRecord } from "../../pipeline/types.js";
import { mapLoadedGenerationToRecord, mapRecordToGenerationData } from "../mappers/generationMapper.js";

function buildRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "44444444-4444-4444-8444-444444444444",
    imageId: "22222222-2222-4222-8222-222222222222",
    projectId: "33333333-3333-4333-8333-333333333333",
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
    projectHash: null,
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
    stateVersion: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("generationMapper redaction", () => {
  it("does not include database connection strings in mapped data", () => {
    const record = buildRecord({
      errors: [
        {
          stage: "preview_ready",
          code: ErrorCode.SERVER_RESTARTED,
          message: "Recovered after restart.",
        },
      ],
    });

    const mapped = mapRecordToGenerationData(record);
    const serialized = JSON.stringify(mapped);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("DATABASE_URL");
  });
});

describe("generationMapper round trip fields", () => {
  it("preserves soft deletion timestamp", () => {
    const deletedAt = "2026-07-23T15:00:00.000Z";
    const mapped = mapRecordToGenerationData(buildRecord({ deletedAt }));
    expect(mapped.deletedAt).toEqual(new Date(deletedAt));
  });
});

describe("mapLoadedGenerationToRecord generated project resolution", () => {
  it("returns generatedProject from the active version snapshot", () => {
    const projectHash = computeProjectHash(generatedProjectFixture);
    const record = mapLoadedGenerationToRecord(buildLoadedRow({
      activeVersionId: projectHash,
      versions: [
        {
          versionId: projectHash,
          versionNumber: 1,
          source: "initial_generation",
          label: "Initial generated project",
          projectHash,
          parentVersionId: null,
          projectSnapshot: generatedProjectFixture,
          changedFiles: [],
          editId: null,
          instruction: null,
          createdAt: new Date("2026-07-25T00:00:00.000Z"),
        },
      ],
    }));

    expect(record.outputs.generatedProject).not.toBeNull();
    expect(record.outputs.generatedProject?.entryFile).toBe(generatedProjectFixture.entryFile);
  });

  it("falls back to pipelineState.generatedProject when no version exists", () => {
    const projectHash = computeProjectHash(generatedProjectFixture);
    const record = mapLoadedGenerationToRecord(buildLoadedRow({
      activeVersionId: null,
      latestProjectHash: projectHash,
      awaitingSandboxValidation: true,
      pipelineState: {
        imageId: "22222222-2222-4222-8222-222222222222",
        generatedProject: generatedProjectFixture,
        projectHash,
      },
    }));

    expect(record.outputs.generatedProject).not.toBeNull();
    expect(record.outputs.generatedProject?.projectName).toBe(generatedProjectFixture.projectName);
  });
});

function buildLoadedRow(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-25T00:00:00.000Z");
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "44444444-4444-4444-8444-444444444444",
    sourceImageId: "22222222-2222-4222-8222-222222222222",
    projectId: "33333333-3333-4333-8333-333333333333",
    status: "Compiling",
    currentStage: "sandbox_compilation",
    activeVersionId: null,
    latestProjectHash: null,
    awaitingSandboxValidation: true,
    validationReportFingerprint: null,
    repairRequired: false,
    repairStatus: "not_required",
    currentRepairAttempt: 0,
    maxRepairAttempts: 3,
    repairInProgress: false,
    manualRetryAllowed: false,
    editedByUser: false,
    confirmedAt: null,
    awaitingPlanConfirmation: false,
    resumeInProgress: false,
    sandboxResumeInProgress: false,
    exportInProgress: false,
    editInProgress: false,
    activeEditId: null,
    rollbackInProgress: false,
    visualComparisonInProgress: false,
    activeComparisonId: null,
    visualCorrectionInProgress: false,
    visualCorrectionAttempt: 0,
    visualCorrectionMaxAttempts: 3,
    previewCaptureRequired: false,
    cancelled: false,
    failStage: null,
    stateVersion: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    outputsDesignAnalysis: null,
    outputsGenerationPlan: null,
    analysisMetadata: null,
    planMetadata: null,
    projectMetadata: null,
    schemaValidation: null,
    staticValidation: null,
    sandboxValidation: null,
    pipelineState: null,
    pendingVisualRecomparison: null,
    errors: [],
    stages: [],
    versions: [],
    repairAttempts: [],
    edits: [],
    visualComparisons: [],
    exports: [],
    ...overrides,
  } as never;
}
