import { describe, expect, it } from "vitest";
import { recoverGenerationsAfterRestart } from "./startupRecovery.js";
import type { GenerationRecord } from "../../pipeline/types.js";
import { ErrorCode } from "@reactify/shared";

class InMemoryGenerationRepository {
  records: GenerationRecord[] = [];

  async findAllActive(): Promise<GenerationRecord[]> {
    return this.records.map((record) => structuredClone(record));
  }

  async save(record: GenerationRecord): Promise<GenerationRecord> {
    const index = this.records.findIndex((entry) => entry.id === record.id);
    const saved = structuredClone(record);
    saved.stateVersion = (saved.stateVersion ?? 0) + 1;
    if (index >= 0) {
      this.records[index] = saved;
    } else {
      this.records.push(saved);
    }
    return saved;
  }
}

describe("recoverGenerationsAfterRestart", () => {
  it("marks interrupted export preparation as failed", async () => {
    const repository = new InMemoryGenerationRepository();
    const now = new Date().toISOString();
    repository.records.push({
      id: "11111111-1111-4111-8111-111111111111",
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
      exports: [
        {
          exportId: "44444444-4444-4444-8444-444444444444",
          status: "preparing",
          filename: "project.zip",
          projectName: "Project",
          generationId: "11111111-1111-4111-8111-111111111111",
          versionId: "v1",
          versionNumber: 1,
          projectHash: "hash",
          fileCount: 1,
          totalSizeBytes: 100,
          createdAt: now,
        },
      ],
      exportInProgress: true,
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
    });

    const recovered = await recoverGenerationsAfterRestart(
      repository as unknown as import("../repositories/GenerationRepository.js").GenerationRepository,
      {
        projectExport: {
          updateMany: async () => ({ count: 0 }),
        },
      } as never,
    );

    expect(recovered).toBe(1);
    const saved = repository.records[0];
    expect(saved.exportInProgress).toBe(false);
    expect(saved.exports[0]?.status).toBe("failed");
    expect(saved.errors.some((error) => error.code === ErrorCode.SERVER_RESTARTED)).toBe(true);
  });

  it("leaves awaiting sandbox validation unchanged", async () => {
    const repository = new InMemoryGenerationRepository();
    const now = new Date().toISOString();
    repository.records.push({
      id: "11111111-1111-4111-8111-111111111111",
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
      awaitingSandboxValidation: true,
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
    });

    const recovered = await recoverGenerationsAfterRestart(
      repository as unknown as import("../repositories/GenerationRepository.js").GenerationRepository,
      { projectExport: { updateMany: async () => ({ count: 0 }) } } as never,
    );

    expect(recovered).toBe(0);
    expect(repository.records[0]?.awaitingSandboxValidation).toBe(true);
  });
});
