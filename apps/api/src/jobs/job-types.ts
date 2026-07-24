export type {
  BackgroundJobStatus,
  BackgroundJobType,
  JobAcceptedResponse,
  JobListResponse,
  JobStatusResponse,
} from "@reactify/shared";

export {
  AutomaticRepairJobPayloadSchema,
  BackgroundJobStatusSchema,
  BackgroundJobTypeSchema,
  DesignAnalysisJobPayloadSchema,
  EditIntentAnalysisJobPayloadSchema,
  ExportPreparationJobPayloadSchema,
  GenerationPlanJobPayloadSchema,
  JobAcceptedResponseSchema,
  JobAttemptStatusSchema,
  JobListResponseSchema,
  JobPayloadSchema,
  JobStatusResponseSchema,
  ProjectEditGenerationJobPayloadSchema,
  ReactProjectGenerationJobPayloadSchema,
  VisualCorrectionJobPayloadSchema,
} from "@reactify/shared";

export const MUTATION_JOB_TYPES = [
  "design_analysis",
  "generation_plan_creation",
  "react_project_generation",
  "automatic_repair",
  "edit_intent_analysis",
  "project_edit_generation",
  "visual_correction",
] as const;

export const ACTIVE_JOB_STATUSES = ["claimed", "running", "waiting_for_client"] as const;

export const CANCELLABLE_JOB_STATUSES = ["queued", "retry_scheduled", "running", "waiting_for_client"] as const;

export const TERMINAL_JOB_STATUSES = ["completed", "failed", "cancelled", "dead_letter"] as const;
