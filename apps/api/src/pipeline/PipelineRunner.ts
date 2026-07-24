import type { PipelineStageName } from "@reactify/generation-contracts";
import { PIPELINE_STAGE_ORDER } from "@reactify/generation-contracts";
import {
  ErrorCode,
  type AIStageConfig,
  type FeatureFlags,
  type LoadPromptFn,
  type PipelineContext,
  type StageResult,
  type AIProvider,
} from "@reactify/shared";
import type { ImageStorage } from "../lib/imageStorage.js";
import { validateSandboxValidationReport } from "../lib/sandboxValidationReport.js";
import { computeProjectHash } from "../lib/projectHash.js";
import { NoopPipelineLogger } from "./logger.js";
import type { StageRegistry } from "./registry.js";
import type { GenerationStore } from "./store.js";
import type { PipelineState } from "./types.js";

function shouldSkipStage(stage: PipelineStageName, flags: FeatureFlags, state: PipelineState): boolean {
  if (stage === "automatic_repair" && !flags.enableRepair && !state.repairRequired) {
    return true;
  }

  if (
    (stage === "sandbox_compilation" || stage === "runtime_validation") &&
    state.sandboxValidation
  ) {
    return true;
  }

  return false;
}

function mergeState(state: PipelineState, output: unknown): PipelineState {
  if (!output || typeof output !== "object") {
    return state;
  }

  return { ...state, ...(output as Partial<PipelineState>) };
}

function getStageStartIndex(fromStage?: PipelineStageName): number {
  if (!fromStage) {
    return 0;
  }

  const index = PIPELINE_STAGE_ORDER.indexOf(fromStage);
  return index >= 0 ? index : 0;
}

export interface PipelineRunnerServices {
  aiProvider: AIProvider;
  loadPrompt: LoadPromptFn;
  aiConfig: AIStageConfig;
  repairConfig: {
    maxAttempts: number;
    maxPatchFileBytes: number;
    maxPatchTotalBytes: number;
  };
}

export interface PipelineRunOptions {
  stopAfter?: PipelineStageName;
  onProgress?: (progress: number, message: string) => Promise<void>;
  shouldCancel?: () => Promise<boolean>;
  ownsLock?: () => Promise<boolean>;
}

export type PipelineSegmentResult =
  | { outcome: "completed" }
  | { outcome: "paused_plan_review" }
  | { outcome: "paused_sandbox" }
  | { outcome: "failed"; code: string; message: string }
  | { outcome: "cancelled" };

export class PipelineRunner {
  private readonly runningGenerations = new Set<string>();

  constructor(
    private readonly registry: StageRegistry,
    private readonly store: GenerationStore,
    private readonly imageStorage: ImageStorage,
    private readonly flags: FeatureFlags,
    private readonly services: PipelineRunnerServices,
  ) {}

  start(input: { ownerId: string; imageId: string; projectId?: string; failStage?: PipelineStageName }): string {
    const record = this.store.create(input);
    return record.id;
  }

  kickoffWithoutJobs(generationId: string): void {
    void (async () => {
      const design = await this.runSegment(generationId, undefined, { stopAfter: "design_analysis" });
      if (design.outcome === "completed") {
        await this.runSegment(generationId, "generation_plan_creation", { stopAfter: "generation_plan_review" });
      }
    })();
  }

  cancel(generationId: string): boolean {
    return this.store.cancel(generationId);
  }

  confirmPlan(
    generationId: string,
    plan: import("@reactify/generation-contracts").GenerationPlanV1,
    editedByUser: boolean,
  ): { ok: true } | { ok: false; reason: string } {
    const result = this.store.confirmPlan({ generationId, plan, editedByUser });
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    return { ok: true };
  }

  async submitSandboxValidation(
    generationId: string,
    body: unknown,
  ): Promise<{ ok: true; duplicate: boolean; shouldResume: boolean } | { ok: false; reason: string }> {
    const record = this.store.get(generationId);
    if (!record) {
      return { ok: false, reason: "not_found" };
    }

    if (!record.awaitingSandboxValidation && record.validationReportFingerprint) {
      const validation = validateSandboxValidationReport(body, generationId);
      if (!validation.ok) {
        return { ok: false, reason: validation.errorCode === ErrorCode.REPORT_TOO_LARGE ? "too_large" : "invalid_report" };
      }

      if (record.validationReportFingerprint === validation.report.reportFingerprint) {
        return { ok: true, duplicate: true, shouldResume: false };
      }

      return { ok: false, reason: "duplicate_conflict" };
    }

    if (!record.awaitingSandboxValidation) {
      return { ok: false, reason: "invalid_state" };
    }

    const validation = validateSandboxValidationReport(body, generationId);
    if (!validation.ok) {
      return { ok: false, reason: validation.errorCode === ErrorCode.REPORT_TOO_LARGE ? "too_large" : "invalid_report" };
    }

    const expectedProjectHash =
      record.projectHash ??
      (record.outputs.generatedProject ? computeProjectHash(record.outputs.generatedProject) : null);

    if (!expectedProjectHash) {
      return { ok: false, reason: "invalid_state" };
    }

    const submitResult = this.store.submitSandboxValidation({
      generationId,
      report: validation.report.request,
      reportFingerprint: validation.report.reportFingerprint,
      expectedProjectHash,
    });

    if (!submitResult.ok) {
      return { ok: false, reason: submitResult.reason };
    }

    if (submitResult.duplicate) {
      return { ok: true, duplicate: true, shouldResume: false };
    }

    const updated = this.store.get(generationId);
    const shouldResume =
      updated?.status !== "RepairFailed" &&
      updated?.status !== "Cancelled" &&
      updated?.status !== "Failed";

    return { ok: true, duplicate: false, shouldResume };
  }

  async resume(generationId: string, options?: PipelineRunOptions): Promise<PipelineSegmentResult> {
    return this.runSegment(generationId, "react_project_generation", options);
  }

  async resumeFromSandbox(generationId: string, options?: PipelineRunOptions): Promise<PipelineSegmentResult> {
    return this.runSegment(generationId, "automatic_repair", options);
  }

  async runSegment(
    generationId: string,
    fromStage?: PipelineStageName,
    options: PipelineRunOptions = {},
  ): Promise<PipelineSegmentResult> {
    if (this.runningGenerations.has(generationId)) {
      return { outcome: "completed" };
    }

    const record = this.store.get(generationId);
    if (!record) {
      return { outcome: "failed", code: ErrorCode.GENERATION_NOT_FOUND, message: "Generation not found." };
    }

    if (record.cancelled) {
      return { outcome: "cancelled" };
    }

    if (record.awaitingSandboxValidation && !fromStage) {
      return { outcome: "paused_sandbox" };
    }

    this.runningGenerations.add(generationId);

    try {
      const persistedState = record.pipelineState;
      let state: PipelineState = persistedState ?? {
        imageId: record.imageId,
        designAnalysis: record.outputs.designAnalysis ?? undefined,
        generationPlan: record.outputs.generationPlan ?? undefined,
        generatedProject: record.outputs.generatedProject ?? undefined,
        planConfirmed: record.confirmedAt ? true : undefined,
        analysisMetadata: record.analysis ?? undefined,
        planMetadata: record.plan ?? undefined,
        projectMetadata: record.project ?? undefined,
        schemaValidation: record.schemaValidation ?? undefined,
        staticValidation: record.staticValidation ?? undefined,
        sandboxValidation: record.sandboxValidation ?? undefined,
        projectHash: record.projectHash ?? undefined,
      };

      const logger = new NoopPipelineLogger();
      const context: PipelineContext = {
        generationId: record.id,
        projectId: record.projectId,
        imageId: record.imageId,
        logger,
        flags: this.flags,
        aiProvider: this.services.aiProvider,
        loadPrompt: this.services.loadPrompt,
        aiConfig: this.services.aiConfig,
        repairConfig: this.services.repairConfig,
        failStage: record.failStage,
      };

      const startIndex = getStageStartIndex(fromStage);

      for (const stageName of PIPELINE_STAGE_ORDER.slice(startIndex)) {
        if (options.shouldCancel && (await options.shouldCancel())) {
          return { outcome: "cancelled" };
        }

        if (options.ownsLock && !(await options.ownsLock())) {
          return { outcome: "cancelled" };
        }

        const current = this.store.get(generationId);
        if (!current) {
          return { outcome: "failed", code: ErrorCode.GENERATION_NOT_FOUND, message: "Generation not found." };
        }

        if (current.cancelled) {
          current.activeStage = null;
          current.status = "Cancelled";
          return { outcome: "cancelled" };
        }

        if (shouldSkipStage(stageName, this.flags, state)) {
          this.store.markStageRunning(current, stageName);
          this.store.markStageFinished(current, stageName, {
            status: "skipped",
            durationMs: 0,
          });
          continue;
        }

        let executor;
        try {
          executor = this.registry.get(stageName);
        } catch (error) {
          current.status = "Failed";
          current.activeStage = null;
          current.errors.push({
            stage: stageName,
            code: ErrorCode.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Invalid stage registration",
          });
          return {
            outcome: "failed",
            code: ErrorCode.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Invalid stage registration",
          };
        }

        if (stageName === "automatic_repair") {
          if (current.repairInProgress) {
            return { outcome: "completed" };
          }
          current.repairInProgress = true;
          current.repairStatus = "analyzing";
        }

        this.store.markStageRunning(current, stageName);

        if (options.onProgress) {
          await options.onProgress(50, `Running ${stageName}`);
        }

        const result = await this.executeStageSafely(
          executor,
          state,
          context,
          stageName,
          current.failStage,
        );

        if (result.status === "paused") {
          current.repairInProgress = false;
          if (stageName === "generation_plan_review") {
            this.store.markStageAwaitingConfirmation(current, stageName);
            this.store.applyStateOutputs(current, state);
            this.store.pauseForPlanReview(current, state);
            return { outcome: "paused_plan_review" };
          }

          if (stageName === "sandbox_compilation") {
            if (result.output) {
              state = mergeState(state, result.output);
            }
            this.store.markStageAwaitingClient(current, stageName);
            this.store.applyStateOutputs(current, state);
            this.store.pauseForSandboxValidation(current, state);
            return { outcome: "paused_sandbox" };
          }

          if (stageName === "runtime_validation") {
            return { outcome: "paused_sandbox" };
          }

          if (stageName === "automatic_repair") {
            if (result.output) {
              state = mergeState(state, result.output);
            }
            current.validationReportFingerprint = null;
            this.store.markStageAwaitingClient(current, "sandbox_compilation");
            this.store.applyStateOutputs(current, state);
            this.store.pauseForSandboxValidation(current, state);
            return { outcome: "paused_sandbox" };
          }
        }

        if (result.output) {
          state = mergeState(state, result.output);
          this.store.applyStateOutputs(current, state);
        }

        this.store.markStageFinished(current, stageName, {
          status:
            result.status === "completed"
              ? "completed"
              : result.status === "skipped"
                ? "skipped"
                : "failed",
          durationMs: result.durationMs,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });

        if (result.status === "failed") {
          current.repairInProgress = false;
          if (stageName === "automatic_repair") {
            const repairStatus = (result.output as Partial<PipelineState> | undefined)?.repairStatus;
            current.status =
              repairStatus === "exhausted" || result.errorCode === ErrorCode.REPAIR_ATTEMPTS_EXHAUSTED
                ? "RepairFailed"
                : "RepairFailed";
            current.repairStatus = repairStatus ?? "failed";
            current.activeStage = null;
            current.pipelineState = null;
            if (result.output) {
              state = mergeState(state, result.output);
              this.store.applyStateOutputs(current, state);
            }
            current.errors.push({
              stage: stageName,
              code: result.errorCode ?? ErrorCode.INTERNAL_ERROR,
              message: result.errorMessage ?? "Automatic repair failed",
            });
            return {
              outcome: "failed",
              code: result.errorCode ?? ErrorCode.INTERNAL_ERROR,
              message: result.errorMessage ?? "Automatic repair failed",
            };
          }

          current.status = "Failed";
          current.activeStage = null;
          current.errors.push({
            stage: stageName,
            code: result.errorCode ?? ErrorCode.INTERNAL_ERROR,
            message: result.errorMessage ?? "Stage failed",
          });
          return {
            outcome: "failed",
            code: result.errorCode ?? ErrorCode.INTERNAL_ERROR,
            message: result.errorMessage ?? "Stage failed",
          };
        }

        if (stageName === "automatic_repair" && result.status === "completed") {
          current.repairInProgress = false;
          state.repairRequired = false;
          state.repairStatus = "succeeded";
        }

        if (options.stopAfter === stageName) {
          return { outcome: "completed" };
        }
      }

      const finished = this.store.get(generationId);
      if (!finished || finished.cancelled) {
        return { outcome: "cancelled" };
      }

      if (state.repairRequired && finished.status !== "RepairFailed") {
        finished.status = "Repairing";
      } else if (finished.status !== "RepairFailed") {
        finished.status = "Ready";
      }
      finished.activeStage = null;
      finished.awaitingPlanConfirmation = false;
      finished.awaitingSandboxValidation = false;
      finished.pipelineState = null;
      finished.resumeInProgress = false;
      finished.sandboxResumeInProgress = false;
      finished.updatedAt = new Date().toISOString();
      return { outcome: "completed" };
    } finally {
      this.runningGenerations.delete(generationId);
      const finished = this.store.get(generationId);
      if (
        finished?.resumeInProgress &&
        finished.status !== "Planning" &&
        !finished.awaitingSandboxValidation
      ) {
        this.store.completeResume(finished);
      }
      if (finished?.sandboxResumeInProgress && finished.status === "RepairRequired") {
        finished.sandboxResumeInProgress = false;
      }
      if (finished) {
        void this.store.persist(finished);
      }
    }
  }

  async run(generationId: string, fromStage?: PipelineStageName, options?: PipelineRunOptions): Promise<void> {
    await this.runSegment(generationId, fromStage, options);
  }

  private async executeStageSafely(
    executor: (input: unknown, context: PipelineContext) => Promise<StageResult<unknown>>,
    state: PipelineState,
    context: PipelineContext,
    stageName: PipelineStageName,
    failStage?: PipelineStageName,
  ): Promise<StageResult<unknown>> {
    const startedAt = Date.now();

    if (failStage === stageName) {
      return {
        status: "failed",
        errorCode: ErrorCode.INTERNAL_ERROR,
        errorMessage: `Forced failure at ${stageName}`,
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const result = await executor(state, context);
      return {
        ...result,
        durationMs: result.durationMs ?? Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: "failed",
        errorCode: ErrorCode.INTERNAL_ERROR,
        errorMessage: error instanceof Error ? error.message : "Unhandled stage exception",
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
