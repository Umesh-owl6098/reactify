import { randomUUID } from "node:crypto";
import type { PipelineStageLogEntry, PipelineStageName } from "@reactify/generation-contracts";
import { deriveUserStatus } from "@reactify/shared";
import type { GenerationRecord, GenerationStoreSnapshot, PipelineState } from "./types.js";

export class GenerationStore {
  private readonly records = new Map<string, GenerationRecord>();

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
    record.updatedAt = new Date().toISOString();

    for (const stage of record.stages) {
      if (stage.status === "pending" || stage.status === "running") {
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
      errors: record.errors,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      durations: {
        totalMs,
        stages,
      },
    };
  }
}
