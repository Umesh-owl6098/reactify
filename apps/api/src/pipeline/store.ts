import { randomUUID } from "node:crypto";
import type {
  GenerationPlanV1,
  PipelineStageLogEntry,
  PipelineStageName,
} from "@reactify/generation-contracts";
import { GenerationPlanV1Schema } from "@reactify/generation-contracts";
import { deriveUserStatus, type FeatureFlags } from "@reactify/shared";
import { validatePlanDependencies } from "../lib/allowlist.js";
import type { GenerationRecord, GenerationStoreSnapshot, PipelineState } from "./types.js";

export class GenerationStore {
  private readonly records = new Map<string, GenerationRecord>();

  constructor(private readonly featureFlags: FeatureFlags) {}

  create(input: {
    imageId: string;
    projectId?: string;
    failStage?: PipelineStageName;
  }): GenerationRecord {
    const now = new Date().toISOString();
    const record: GenerationRecord = {
      id: randomUUID(),
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
      editedByUser: false,
      confirmedAt: null,
      awaitingPlanConfirmation: false,
      pipelineState: null,
      resumeInProgress: false,
      errors: [],
      cancelled: false,
      failStage: input.failStage,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.id, record);
    return record;
  }

  get(id: string): GenerationRecord | undefined {
    return this.records.get(id);
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
    record.pipelineState = null;
    record.updatedAt = new Date().toISOString();

    for (const stage of record.stages) {
      if (
        stage.status === "pending" ||
        stage.status === "running" ||
        stage.status === "awaiting_confirmation"
      ) {
        stage.status = "cancelled";
        stage.completedAt = record.updatedAt;
      }
    }

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
    record.outputs = {
      designAnalysis: state.designAnalysis ?? null,
      generationPlan: state.generationPlan ?? null,
      generatedProject: state.generatedProject ?? null,
    };
    record.analysis = state.analysisMetadata ?? null;
    record.plan = state.planMetadata ?? null;
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

    return { ok: true, record };
  }

  completeResume(record: GenerationRecord): void {
    record.resumeInProgress = false;
    record.pipelineState = null;
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

    return {
      id: record.id,
      imageId: record.imageId,
      projectId: record.projectId,
      status: record.status,
      activeStage: record.activeStage,
      stages: record.stages,
      outputs: record.outputs,
      analysis: record.analysis,
      plan: record.plan,
      editedByUser: record.editedByUser,
      confirmedAt: record.confirmedAt,
      awaitingPlanConfirmation: record.awaitingPlanConfirmation,
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
