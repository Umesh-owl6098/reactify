import { randomUUID } from "node:crypto";
import type {
  GenerationPlanV1,
  PipelineStageLogEntry,
  PipelineStageName,
  SandboxValidationRequest,
} from "@reactify/generation-contracts";
import { GenerationPlanV1Schema } from "@reactify/generation-contracts";
import { deriveUserStatus, type FeatureFlags } from "@reactify/shared";
import { toGeneratedProjectSummary } from "../lib/generatedProjectResponse.js";
import { buildRepairStatusSnapshot } from "../lib/repair/repairSnapshot.js";
import { buildExportSnapshotFields } from "../lib/export/exportEligibility.js";
import { buildEditSnapshotFields } from "../lib/edit/editEligibility.js";
import { buildVisualComparisonSnapshotFields } from "../lib/visual-comparison/visualComparisonEligibility.js";
import { completeEditAfterValidation, getActiveEditClarification, buildLatestEditSummary } from "../lib/edit/EditService.js";
import { completeVisualCorrectionAfterValidation } from "../lib/visual-comparison/VisualComparisonService.js";
import { ensureInitialVersion } from "../lib/edit/versionStore.js";
import { finalizeValidatedRepairVersion } from "../lib/repair/repairVersionFinalization.js";
import { validatePlanDependencies } from "../lib/allowlist.js";
import { generationStatusForQueuedJob, JOB_TYPE_TO_STAGE } from "../jobs/generation-sync.js";
import type { BackgroundJobType } from "../jobs/job-types.js";
import { isGenerationRetryAllowed } from "../jobs/generation-recovery.js";
import { logEvent } from "../lib/structured-log.js";
import type { GenerationRecord, GenerationStoreSnapshot, PipelineState } from "./types.js";

export type GenerationPersistHandler = (record: GenerationRecord) => Promise<void>;

export class GenerationStore {
  private readonly records = new Map<string, GenerationRecord>();
  private persistHandler: GenerationPersistHandler | null = null;

  constructor(
    private readonly featureFlags: FeatureFlags,
    private readonly maxRepairAttempts: number,
    private readonly maxVisualCorrectionAttempts = 3,
  ) {}

  setPersistHandler(handler: GenerationPersistHandler | null): void {
    this.persistHandler = handler;
  }

  hydrate(records: GenerationRecord[]): void {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  async persist(record: GenerationRecord): Promise<void> {
    if (!this.persistHandler) {
      return;
    }
    await this.persistHandler(record);
  }

  async persistById(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      await this.persist(record);
    }
  }

  create(input: {
    ownerId: string;
    imageId: string;
    projectId?: string;
    deferPersist?: boolean;
  }): GenerationRecord {
    const now = new Date().toISOString();
    const record: GenerationRecord = {
      id: randomUUID(),
      ownerId: input.ownerId,
      imageId: input.imageId,
      projectId: input.projectId ?? randomUUID(),
      status: "Queued",
      activeStage: null,
      stages: [],
      outputs: {
        designAnalysis: null,
        generationPlan: null,
        generatedProject: null,
      },
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
      maxRepairAttempts: this.maxRepairAttempts,
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
      failStage: undefined,
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
      visualCorrectionMaxAttempts: this.maxVisualCorrectionAttempts,
      previewCaptureRequired: false,
      pendingVisualRecomparison: null,
      stateVersion: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.id, record);
    if (!input.deferPersist) {
      void this.persist(record);
    }
    return record;
  }

  get(id: string): GenerationRecord | undefined {
    const record = this.records.get(id);
    if (record?.deletedAt) {
      return undefined;
    }
    return record;
  }

  getIncludingDeleted(id: string): GenerationRecord | undefined {
    return this.records.get(id);
  }

  listActive(): GenerationRecord[] {
    return [...this.records.values()].filter((record) => !record.deletedAt);
  }

  softDelete(id: string): boolean {
    const record = this.records.get(id);
    if (!record || record.deletedAt) {
      return false;
    }
    record.deletedAt = new Date().toISOString();
    record.updatedAt = record.deletedAt;
    void this.persist(record);
    return true;
  }

  markFailed(
    id: string,
    stage: PipelineStageName,
    code: string,
    message: string,
    options?: { manualRetryAllowed?: boolean },
  ): boolean {
    const record = this.records.get(id);
    if (!record || record.status === "Ready" || record.status === "Cancelled") {
      return false;
    }

    record.status = "Failed";
    record.activeStage = null;
    record.failStage = stage;
    record.manualRetryAllowed = options?.manualRetryAllowed ?? false;
    record.errors.push({ stage, code, message });
    record.updatedAt = new Date().toISOString();
    void this.persist(record);
    return true;
  }

  recoverFromWorkerFailure(id: string, jobType: BackgroundJobType): boolean {
    const record = this.records.get(id);
    if (!record || record.status !== "Failed" || !record.manualRetryAllowed || record.cancelled) {
      return false;
    }

    const nextStatus = generationStatusForQueuedJob(jobType);
    if (!nextStatus) {
      return false;
    }

    record.status = nextStatus;
    record.activeStage = JOB_TYPE_TO_STAGE[jobType] ?? record.activeStage;
    record.failStage = undefined;
    record.manualRetryAllowed = false;
    record.updatedAt = new Date().toISOString();
    return true;
  }

  cancel(id: string): boolean {
    const record = this.records.get(id);
    if (!record || record.status === "Ready" || record.status === "Failed" || record.status === "Cancelled") {
      return false;
    }

    record.cancelled = true;
    record.status = "Cancelled";
    record.activeStage = null;
    record.awaitingPlanConfirmation = false;
    record.awaitingSandboxValidation = false;
    record.repairInProgress = false;
    record.exportInProgress = false;
    record.editInProgress = false;
    record.activeEditId = null;
    record.rollbackInProgress = false;
    record.visualComparisonInProgress = false;
    record.visualCorrectionInProgress = false;
    record.activeComparisonId = null;
    record.previewCaptureRequired = false;
    record.pendingVisualRecomparison = null;
    record.pipelineState = null;
    record.updatedAt = new Date().toISOString();

    for (const stage of record.stages) {
      if (
        stage.status === "pending" ||
        stage.status === "running" ||
        stage.status === "awaiting_confirmation" ||
        stage.status === "awaiting_client"
      ) {
        stage.status = "cancelled";
        stage.completedAt = record.updatedAt;
      }
    }

    void this.persist(record);
    return true;
  }

  markStageRunning(record: GenerationRecord, stage: PipelineStageName): void {
    const startedAt = new Date().toISOString();
    record.activeStage = stage;
    record.status = deriveUserStatus(stage);
    record.updatedAt = startedAt;
    record.stages.push({
      stage,
      status: "running",
      startedAt,
    });
  }

  markStageAwaitingClient(record: GenerationRecord, stage: PipelineStageName): void {
    const current = [...record.stages].reverse().find((item) => item.stage === stage && !item.completedAt);
    const updatedAt = new Date().toISOString();

    if (current) {
      current.status = "awaiting_client";
      current.completedAt = undefined;
    }

    record.activeStage = stage;
    record.status = "Compiling";
    record.awaitingSandboxValidation = true;
    record.updatedAt = updatedAt;
  }

  markStageAwaitingConfirmation(record: GenerationRecord, stage: PipelineStageName): void {
    const current = [...record.stages].reverse().find((item) => item.stage === stage && !item.completedAt);
    const updatedAt = new Date().toISOString();

    if (current) {
      current.status = "awaiting_confirmation";
      current.completedAt = undefined;
    }

    record.activeStage = stage;
    record.status = "Planning";
    record.awaitingPlanConfirmation = true;
    record.failStage = undefined;
    record.manualRetryAllowed = false;
    record.updatedAt = updatedAt;
  }

  markStageFinished(
    record: GenerationRecord,
    stage: PipelineStageName,
    entry: Omit<PipelineStageLogEntry, "stage">,
  ): void {
    const current = [...record.stages].reverse().find((item) => item.stage === stage && !item.completedAt);
    const completedAt = new Date().toISOString();

    if (current) {
      current.status = entry.status;
      current.completedAt = completedAt;
      current.durationMs = entry.durationMs;
      current.errorCode = entry.errorCode;
      current.errorMessage = entry.errorMessage;
    } else {
      record.stages.push({
        stage,
        status: entry.status,
        completedAt,
        durationMs: entry.durationMs,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
      });
    }

    record.updatedAt = completedAt;
  }

  applyStateOutputs(record: GenerationRecord, state: PipelineState): void {
    // A stage that did not produce an output must not erase the one already on
    // the record; a partial resume would otherwise drop the design analysis or
    // the project entirely.
    record.outputs = {
      designAnalysis: state.designAnalysis ?? record.outputs.designAnalysis ?? null,
      generationPlan: state.generationPlan ?? record.outputs.generationPlan ?? null,
      generatedProject: state.generatedProject ?? record.outputs.generatedProject ?? null,
    };
    record.analysis = state.analysisMetadata ?? null;
    record.plan = state.planMetadata ?? null;
    record.project = state.projectMetadata ?? null;
    record.schemaValidation = state.schemaValidation ?? null;
    record.staticValidation = state.staticValidation ?? null;
    record.sandboxValidation = state.sandboxValidation ?? null;
    record.projectHash = state.projectHash ?? record.projectHash;
    record.repairRequired = state.repairRequired ?? record.repairRequired;
    record.repairStatus = state.repairStatus ?? record.repairStatus;
    record.currentRepairAttempt = state.currentRepairAttempt ?? record.currentRepairAttempt;
    record.repairAttempts = state.repairAttempts ?? record.repairAttempts;
    record.repairInProgress = state.repairInProgress ?? record.repairInProgress;
    record.manualRetryAllowed = state.manualRetryAllowed ?? record.manualRetryAllowed;
    if (state.validationReportFingerprint !== undefined) {
      record.validationReportFingerprint = state.validationReportFingerprint;
    }
    if (state.generatedProject) {
      record.outputs.generatedProject = state.generatedProject;
    }
    if (state.schemaValidation) {
      record.schemaValidation = state.schemaValidation;
    }
    if (state.staticValidation) {
      record.staticValidation = state.staticValidation;
    }
  }

  pauseForSandboxValidation(record: GenerationRecord, state: PipelineState): void {
    record.pipelineState = state;

    if (state.generatedProject) {
      record.outputs.generatedProject = state.generatedProject;
    }

    record.projectHash = state.projectHash ?? record.projectHash;

    const initialVersion = ensureInitialVersion(record);
    if (initialVersion) {
      logEvent("initial_project_version_created", {
        generationId: record.id,
        activeVersionId: record.activeVersionId,
        projectHash: record.projectHash,
        versionNumber: initialVersion.versionNumber,
      });
    }

    record.awaitingSandboxValidation = true;
    record.status = "Compiling";
    record.activeStage = "sandbox_compilation";
    record.updatedAt = new Date().toISOString();
    logEvent("waiting_for_browser_validation", {
      generationId: record.id,
      projectHash: record.projectHash,
      activeStage: record.activeStage,
    });
    void this.persist(record);
  }

  /**
   * The mock provider has no browser client to post a validation callback, but
   * it still follows the real validation persistence sequence. In particular,
   * create the immutable initial version before marking the validation result
   * successful so Ready generations have an active project for preview, export,
   * edits, and comparisons.
   */
  completeMockSandboxValidation(record: GenerationRecord, state: PipelineState): void {
    if (!state.generatedProject || !state.projectHash || !state.sandboxValidation) {
      return;
    }

    record.pipelineState = state;
    record.outputs.generatedProject = state.generatedProject;
    record.projectHash = state.projectHash;
    const initialVersion = ensureInitialVersion(record);
    record.sandboxValidation = state.sandboxValidation;
    record.validationReportFingerprint = `mock:${state.projectHash}`;
    record.awaitingSandboxValidation = false;
    record.repairRequired = false;
    record.repairStatus = "succeeded";
    record.updatedAt = new Date().toISOString();

    if (initialVersion) {
      logEvent("mock_initial_project_version_created", {
        generationId: record.id,
        activeVersionId: initialVersion.versionId,
        projectHash: initialVersion.projectHash,
        versionNumber: initialVersion.versionNumber,
      });
    }
  }

  pauseForPlanReview(record: GenerationRecord, state: PipelineState): void {
    record.pipelineState = state;
    record.awaitingPlanConfirmation = true;
    record.status = "Planning";
    record.activeStage = "generation_plan_review";
    record.updatedAt = new Date().toISOString();
  }

  confirmPlan(input: {
    generationId: string;
    plan: GenerationPlanV1;
    editedByUser: boolean;
  }):
    | { ok: true; record: GenerationRecord }
    | { ok: false; reason: "not_found" | "invalid_state" | "already_resumed" | "schema_invalid" | "unsafe_dependency" } {
    const record = this.records.get(input.generationId);
    if (!record) {
      return { ok: false, reason: "not_found" };
    }

    if (record.cancelled || record.status === "Cancelled") {
      return { ok: false, reason: "invalid_state" };
    }

    if (!record.awaitingPlanConfirmation && record.confirmedAt) {
      return { ok: false, reason: "already_resumed" };
    }

    if (!record.awaitingPlanConfirmation) {
      return { ok: false, reason: "invalid_state" };
    }

    const parsedPlan = GenerationPlanV1Schema.safeParse(input.plan);
    if (!parsedPlan.success) {
      return { ok: false, reason: "schema_invalid" };
    }

    const dependencyResult = validatePlanDependencies(parsedPlan.data);
    if (!dependencyResult.ok) {
      return { ok: false, reason: "unsafe_dependency" };
    }

    const confirmedAt = new Date().toISOString();
    const state: PipelineState = {
      ...(record.pipelineState ?? { imageId: record.imageId }),
      generationPlan: parsedPlan.data,
      planConfirmed: true,
    };

    record.outputs.generationPlan = parsedPlan.data;
    record.pipelineState = state;
    record.editedByUser = input.editedByUser;
    record.confirmedAt = confirmedAt;
    record.awaitingPlanConfirmation = false;
    record.resumeInProgress = true;
    record.status = "Generating";
    record.updatedAt = confirmedAt;

    this.markStageFinished(record, "generation_plan_review", {
      status: "completed",
      durationMs: 0,
    });

    void this.persist(record);
    return { ok: true, record };
  }

  completeResume(record: GenerationRecord): void {
    record.resumeInProgress = false;
    record.sandboxResumeInProgress = false;
    record.pipelineState = null;
  }

  submitSandboxValidation(input: {
    generationId: string;
    report: SandboxValidationRequest;
    reportFingerprint: string;
    expectedProjectHash: string;
  }):
    | { ok: true; record: GenerationRecord; duplicate: boolean }
    | {
        ok: false;
        reason:
          | "not_found"
          | "invalid_state"
          | "hash_mismatch"
          | "duplicate_conflict"
          | "already_resumed";
      } {
    const record = this.records.get(input.generationId);
    if (!record) {
      return { ok: false, reason: "not_found" };
    }

    if (record.cancelled || record.status === "Cancelled" || record.status === "Failed") {
      return { ok: false, reason: "invalid_state" };
    }

    if (record.validationReportFingerprint) {
      if (record.validationReportFingerprint === input.reportFingerprint) {
        return { ok: true, record, duplicate: true };
      }
      return { ok: false, reason: "duplicate_conflict" };
    }

    if (!record.awaitingSandboxValidation) {
      return { ok: false, reason: "invalid_state" };
    }

    if (record.projectHash !== input.expectedProjectHash || input.report.projectHash !== input.expectedProjectHash) {
      return { ok: false, reason: "hash_mismatch" };
    }

    logEvent("validation_received", {
      generationId: record.id,
      projectHash: input.report.projectHash,
      compilationSuccess: input.report.compilation.success,
      runtimeSuccess: input.report.runtime.success,
      compilationDurationMs: input.report.compilation.durationMs,
    });

    const compilationSucceeded = input.report.compilation.success;
    const runtimeSucceeded = compilationSucceeded && input.report.runtime.success;
    const repairRequired = !compilationSucceeded || !runtimeSucceeded;

    const state: PipelineState = {
      ...(record.pipelineState ?? { imageId: record.imageId }),
      sandboxValidation: {
        projectHash: input.report.projectHash,
        compilation: input.report.compilation,
        runtime: input.report.runtime,
        validatedAt: input.report.validatedAt,
      },
      repairRequired,
      repairImplemented: repairRequired,
      projectHash: input.report.projectHash,
      awaitingSandboxValidation: false,
    };

    const latestAttempt = record.repairAttempts.at(-1);
    if (latestAttempt && latestAttempt.status === "waiting_for_revalidation") {
      latestAttempt.sandboxValidationAfter = state.sandboxValidation;
      latestAttempt.completedAt = new Date().toISOString();
      latestAttempt.status = runtimeSucceeded ? "succeeded" : "failed";
      if (!runtimeSucceeded) {
        latestAttempt.failureReason = "Browser revalidation failed after repair.";
      }
    }

    if (runtimeSucceeded) {
      state.repairRequired = false;
      state.repairStatus = "succeeded";
      record.repairRequired = false;
      record.repairStatus = "succeeded";
      record.projectHash = input.report.projectHash;
      if (state.generatedProject) {
        record.outputs.generatedProject = state.generatedProject;
      }
      ensureInitialVersion(record);
      finalizeValidatedRepairVersion(record, input.report.projectHash);
      completeEditAfterValidation(record, true);
      completeVisualCorrectionAfterValidation(record, true);
    } else {
      state.repairRequired = true;
      state.repairStatus = record.currentRepairAttempt >= record.maxRepairAttempts ? "exhausted" : "failed";
      record.repairRequired = true;
      record.repairStatus = state.repairStatus;
      completeEditAfterValidation(record, false);
      completeVisualCorrectionAfterValidation(record, false);
    }

    record.pipelineState = state;
    record.sandboxValidation = state.sandboxValidation ?? null;
    record.validationReportFingerprint = input.reportFingerprint;
    record.awaitingSandboxValidation = false;
    record.sandboxResumeInProgress = !runtimeSucceeded && record.currentRepairAttempt < record.maxRepairAttempts;
    record.status = runtimeSucceeded
      ? record.currentRepairAttempt > 0
        ? "Repairing"
        : "Compiling"
      : record.currentRepairAttempt >= record.maxRepairAttempts
        ? "RepairFailed"
        : "Repairing";
    record.updatedAt = new Date().toISOString();

    this.markStageFinished(record, "sandbox_compilation", {
      status: compilationSucceeded ? "completed" : "failed",
      durationMs: input.report.compilation.durationMs,
      errorCode: compilationSucceeded ? undefined : "SANDBOX_COMPILATION_FAILED",
      errorMessage: compilationSucceeded ? undefined : "Browser-assisted sandbox compilation failed.",
    });

    this.markStageFinished(record, "runtime_validation", {
      status: runtimeSucceeded ? "completed" : "failed",
      durationMs: input.report.runtime.durationMs,
      errorCode: runtimeSucceeded ? undefined : "RUNTIME_VALIDATION_FAILED",
      errorMessage: runtimeSucceeded ? undefined : "Browser-assisted runtime validation failed.",
    });

    if (!compilationSucceeded) {
      record.errors.push({
        stage: "sandbox_compilation",
        code: "SANDBOX_COMPILATION_FAILED",
        message: "Sandbox compilation reported errors from the browser client.",
      });
      logEvent("compilation_failed", {
        generationId: record.id,
        projectHash: input.report.projectHash,
        errorCount: input.report.compilation.errors.length,
      });
    } else {
      logEvent("compilation_passed", {
        generationId: record.id,
        projectHash: input.report.projectHash,
        durationMs: input.report.compilation.durationMs,
      });
    }

    if (compilationSucceeded && !runtimeSucceeded) {
      record.errors.push({
        stage: "runtime_validation",
        code: "RUNTIME_VALIDATION_FAILED",
        message: "Runtime validation reported errors from the browser client.",
      });
    }

    void this.persist(record);
    logEvent("validation_accepted", {
      generationId: record.id,
      projectHash: input.report.projectHash,
      runtimeSucceeded,
      repairRequired,
      nextStatus: record.status,
    });
    return { ok: true, record, duplicate: false };
  }

  requestManualRetry(generationId: string):
    | { ok: true; record: GenerationRecord }
    | { ok: false; reason: "not_found" | "invalid_state" } {
    const record = this.records.get(generationId);
    if (!record) {
      return { ok: false, reason: "not_found" };
    }

    if (record.cancelled || !record.manualRetryAllowed || record.repairInProgress) {
      return { ok: false, reason: "invalid_state" };
    }

    record.repairStatus = "analyzing";
    record.manualRetryAllowed = false;
    record.updatedAt = new Date().toISOString();
    void this.persist(record);
    return { ok: true, record };
  }

  toSnapshot(record: GenerationRecord): GenerationStoreSnapshot {
    const stages: Record<string, number> = {};
    let totalMs = 0;

    for (const entry of record.stages) {
      if (entry.durationMs !== undefined) {
        stages[entry.stage] = entry.durationMs;
        totalMs += entry.durationMs;
      }
    }

    const exportFields = buildExportSnapshotFields(record);
    const editFields = buildEditSnapshotFields(record);
    const visualFields = buildVisualComparisonSnapshotFields(record);
    const clarification = getActiveEditClarification(record);
    const latest = record.exports.at(-1);
    const latestExportSummary = latest
      ? {
          exportId: latest.exportId,
          status: latest.status,
          filename: latest.filename,
          projectName: latest.projectName,
          generationId: latest.generationId,
          versionId: latest.versionId,
          versionNumber: latest.versionNumber,
          projectHash: latest.projectHash,
          fileCount: latest.fileCount,
          totalSizeBytes: latest.totalSizeBytes,
          createdAt: latest.createdAt,
          completedAt: latest.completedAt,
          failureReason: latest.failureReason,
        }
      : null;

    const latestEditSummary = buildLatestEditSummary(record);
    const activeVersion = record.versions.find((version) => version.versionId === record.activeVersionId);

    return {
      id: record.id,
      ownerId: record.ownerId,
      imageId: record.imageId,
      projectId: record.projectId,
      status: record.status,
      activeStage: record.activeStage,
      stages: record.stages,
      outputs: {
        designAnalysis: record.outputs.designAnalysis,
        generationPlan: record.outputs.generationPlan,
        generatedProject: record.outputs.generatedProject
          ? toGeneratedProjectSummary(record.outputs.generatedProject)
          : null,
      },
      analysis: record.analysis,
      plan: record.plan,
      project: record.project,
      schemaValidation: record.schemaValidation,
      staticValidation: record.staticValidation,
      sandboxValidation: record.sandboxValidation,
      projectHash: record.projectHash,
      editedByUser: record.editedByUser,
      confirmedAt: record.confirmedAt,
      awaitingPlanConfirmation: record.awaitingPlanConfirmation,
      awaitingSandboxValidation: record.awaitingSandboxValidation,
      repairRequired: record.repairRequired,
      repairStatus: record.repairStatus,
      currentRepairAttempt: record.currentRepairAttempt,
      maxRepairAttempts: record.maxRepairAttempts,
      repairInProgress: record.repairInProgress,
      manualRetryAllowed: record.manualRetryAllowed,
      retryAllowed: isGenerationRetryAllowed(record),
      exportInProgress: record.exportInProgress,
      repair: buildRepairStatusSnapshot(record, record.maxRepairAttempts),
      exportAllowed: exportFields.exportAllowed,
      exportBlockedReason: exportFields.exportBlockedReason,
      latestExportSummary,
      editAllowed: editFields.editAllowed,
      editBlockedReason: editFields.editBlockedReason,
      activeEditId: record.activeEditId,
      activeEditStatus: record.edits.find((edit) => edit.editId === record.activeEditId)?.status ?? null,
      clarificationRequired: clarification.clarificationRequired,
      clarificationQuestion: clarification.clarificationQuestion,
      latestEditSummary,
      activeVersionId: record.activeVersionId,
      activeVersionNumber: activeVersion?.versionNumber ?? null,
      sandboxRevalidationRequired: editFields.sandboxRevalidationRequired,
      visualComparisonAllowed: visualFields.visualComparisonAllowed,
      visualComparisonBlockedReason: visualFields.visualComparisonBlockedReason,
      activeComparisonId: visualFields.activeComparisonId,
      activeComparisonStatus: visualFields.activeComparisonStatus,
      latestSimilarityScore: visualFields.latestSimilarityScore,
      latestDifferencePercentage: visualFields.latestDifferencePercentage,
      visualCorrectionAvailable: visualFields.visualCorrectionAvailable,
      visualCorrectionStatus: visualFields.visualCorrectionStatus,
      visualCorrectionAttempt: visualFields.visualCorrectionAttempt,
      visualCorrectionMaxAttempts: visualFields.visualCorrectionMaxAttempts,
      previewCaptureRequired: visualFields.previewCaptureRequired,
      errors: record.errors,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      durations: {
        totalMs,
        stages,
      },
      featureFlags: {
        enableGenerationPlanEditing: this.featureFlags.enableGenerationPlanEditing,
      },
    };
  }
}
