import type { PipelineStageName } from "@reactify/generation-contracts";
import type { GenerationRecord } from "../pipeline/types.js";
import type { BackgroundJobType } from "./job-types.js";

export const JOB_TYPE_TO_STAGE: Partial<Record<BackgroundJobType, PipelineStageName>> = {
  design_analysis: "design_analysis",
  generation_plan_creation: "generation_plan_creation",
  react_project_generation: "react_project_generation",
  automatic_repair: "automatic_repair",
};

const generationStatusByQueuedJob: Partial<Record<BackgroundJobType, GenerationRecord["status"]>> = {
  design_analysis: "Analyzing",
  generation_plan_creation: "Planning",
  react_project_generation: "Generating",
  automatic_repair: "Repairing",
  edit_intent_analysis: "Generating",
  project_edit_generation: "Generating",
  visual_correction: "Repairing",
  export_preparation: "Ready",
};

export function generationStatusForQueuedJob(jobType: BackgroundJobType): GenerationRecord["status"] | null {
  return generationStatusByQueuedJob[jobType] ?? null;
}

export function syncGenerationForJobStart(record: GenerationRecord, jobType: BackgroundJobType): void {
  const next = generationStatusForQueuedJob(jobType);
  if (next) {
    record.status = next;
    record.activeStage = JOB_TYPE_TO_STAGE[jobType] ?? record.activeStage;
    record.updatedAt = new Date().toISOString();
  }
}

export function syncGenerationForJobFailure(record: GenerationRecord, failureCode?: string | null): void {
  if (record.cancelled) {
    record.status = "Cancelled";
    return;
  }

  if (failureCode === "GENERATION_CANCELLED" || failureCode === "JOB_CANCELLED") {
    record.status = "Cancelled";
    return;
  }

  if (record.status !== "RepairFailed") {
    record.status = "Failed";
  }
}

export function syncGenerationForJobCompletion(
  record: GenerationRecord,
  jobType: BackgroundJobType,
  waitingForClient: boolean,
): void {
  if (waitingForClient) {
    if (jobType === "generation_plan_creation" || jobType === "react_project_generation") {
      // Generation store handles pause flags during pipeline execution.
      return;
    }
    return;
  }

  if (jobType === "export_preparation") {
    return;
  }
}
