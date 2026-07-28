import type { PipelineStageName } from "@reactify/generation-contracts";
import type { GenerationRecord } from "../pipeline/types.js";
import type { BackgroundJobType } from "./job-types.js";
import type { ProviderFailureMetadata } from "./provider-failure-metadata.js";
import { canAssignReady } from "../lib/edit/versionStore.js";

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

const NON_GENERATION_FAILURE_JOB_TYPES = new Set<BackgroundJobType>([
  "export_preparation",
  "edit_intent_analysis",
  "project_edit_generation",
  "visual_correction",
]);

export function syncGenerationForJobFailure(
  record: GenerationRecord,
  failureCode?: string | null,
  jobType?: BackgroundJobType,
  failureMessage?: string | null,
  failureMetadata?: ProviderFailureMetadata,
): void {
  if (jobType === "edit_intent_analysis" || jobType === "project_edit_generation") {
    const edit = record.edits.find((entry) => entry.editId === record.activeEditId);
    if (edit && !["completed", "failed", "cancelled"].includes(edit.status)) {
      edit.status = "failed";
      edit.failureReason = failureCode ?? "Edit job failed.";
      edit.completedAt = new Date().toISOString();
    }
    record.editInProgress = false;
    record.activeEditId = null;
    restoreGenerationReadyAfterEdit(record);
    record.updatedAt = new Date().toISOString();
    return;
  }

  if (jobType === "export_preparation") {
    // Look for the still-pending export first.  If the artifact write failed
    // AFTER status was already set to "ready" (pre-fix bug order), fall back
    // to the most recent non-ready export so the failure is still surfaced.
    const nonReadyExports = record.exports.filter((entry) => entry.status !== "ready");
    const pendingExport =
      record.exports.find((entry) => entry.status === "preparing") ??
      nonReadyExports[nonReadyExports.length - 1];
    if (pendingExport && pendingExport.status !== "ready") {
      pendingExport.status = "failed";
      pendingExport.failureReason = failureMessage ?? failureCode ?? "Export preparation failed.";
      pendingExport.completedAt = new Date().toISOString();
    }
    record.exportInProgress = false;
    record.updatedAt = new Date().toISOString();
    return;
  }

  if (jobType && NON_GENERATION_FAILURE_JOB_TYPES.has(jobType)) {
    return;
  }
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

  const stage = jobType ? JOB_TYPE_TO_STAGE[jobType] : record.activeStage;
  if (record.status === "Failed" && stage) {
    // Manual retry resumes from the failed stage; without these flags the
    // retry route and the failure UI both refuse the generation forever.
    record.failStage = stage;
    record.manualRetryAllowed = true;
  }
  if (stage && failureCode && failureMessage) {
    record.errors.push({
      stage,
      code: failureCode,
      message: failureMessage,
      provider: failureMetadata?.provider,
      model: failureMetadata?.model,
      httpStatus: failureMetadata?.httpStatus,
      providerRequestId: failureMetadata?.providerRequestId,
      retryable: failureMetadata?.retryable,
      validationIssues: failureMetadata?.validationIssues,
    });
  }
  record.updatedAt = new Date().toISOString();
}

/** Restore Ready after edit-side jobs pause for client input or finish without mutating the project. */
export function restoreGenerationReadyAfterEdit(record: GenerationRecord): void {
  if (
    record.status === "Generating" &&
    canAssignReady(record) &&
    !record.editInProgress
  ) {
    record.status = "Ready";
    record.activeStage = null;
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
    if (jobType === "edit_intent_analysis" || jobType === "project_edit_generation") {
      restoreGenerationReadyAfterEdit(record);
    }
    return;
  }

  if (jobType === "export_preparation") {
    return;
  }
}
