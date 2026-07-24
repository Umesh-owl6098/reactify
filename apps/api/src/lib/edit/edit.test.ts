import { describe, expect, it } from "vitest";
import { createProjectEditFixtureJson, editIntentFixture, generatedProjectFixture } from "@reactify/test-utils";
import { MockAIProvider } from "@reactify/test-utils";
import type { GenerationRecord } from "../../pipeline/types.js";
import { computeProjectHash } from "../projectHash.js";
import { EditService } from "./EditService.js";
import { evaluateEditEligibility } from "./editEligibility.js";
import { ensureInitialVersion } from "./versionStore.js";
import { testEnv } from "../../test/helpers.js";
import { defaultLoadPrompt } from "../../prompts/loader.js";

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

describe("editEligibility", () => {
  it("allows edits for preview-ready projects", () => {
    expect(evaluateEditEligibility(createReadyRecord()).ok).toBe(true);
  });

  it("blocks edits during repair and when cancelled", () => {
    expect(evaluateEditEligibility(createReadyRecord({ repairInProgress: true })).ok).toBe(false);
    expect(evaluateEditEligibility(createReadyRecord({ cancelled: true, status: "Cancelled" })).ok).toBe(false);
  });
});

describe("EditService", () => {
  it("creates a new version from a low-risk edit", async () => {
    const aiProvider = new MockAIProvider({
      responses: [JSON.stringify(editIntentFixture), createProjectEditFixtureJson()],
    });
    const service = EditService.fromDeps({ aiProvider, loadPrompt: defaultLoadPrompt, env: testEnv });
    const record = createReadyRecord();

    const result = await service.createEdit(record, {
      instruction: "Make the primary button dark blue.",
      expectedProjectHash: record.projectHash!,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.summary.status).toBe("awaiting_sandbox_validation");
    expect(record.versions.length).toBe(2);
    expect(record.projectHash).not.toBe(result.summary.projectHashBefore);
  });
});
