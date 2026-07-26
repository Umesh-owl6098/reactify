import { z } from "zod";

/** Project versions are keyed by deterministic project hash, not UUIDs. */
export const ProjectVersionIdSchema = z.string().min(1);

export const BackgroundJobTypeSchema = z.enum([
  "design_analysis",
  "generation_plan_creation",
  "react_project_generation",
  "automatic_repair",
  "edit_intent_analysis",
  "project_edit_generation",
  "visual_correction",
  "export_preparation",
]);

export const BackgroundJobStatusSchema = z.enum([
  "queued",
  "claimed",
  "running",
  "waiting_for_client",
  "retry_scheduled",
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
]);

export const JobAttemptStatusSchema = z.enum([
  "started",
  "completed",
  "failed",
  "cancelled",
]);

export const DesignAnalysisJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
  imageId: z.string().uuid(),
});

export const GenerationPlanJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
});

export const ReactProjectGenerationJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
  editedByUser: z.boolean().optional(),
});

export const AutomaticRepairJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
  repairAttemptNumber: z.number().int().positive().optional(),
});

export const EditIntentAnalysisJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
  editId: z.string().uuid(),
});

export const ProjectEditGenerationJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
  editId: z.string().uuid(),
});

export const VisualCorrectionJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
  comparisonId: z.string().uuid(),
  versionId: ProjectVersionIdSchema,
  expectedProjectHash: z.string().min(1),
});

export const ExportPreparationJobPayloadSchema = z.object({
  generationId: z.string().uuid(),
  exportId: z.string().uuid(),
  versionId: ProjectVersionIdSchema,
  expectedProjectHash: z.string().min(1),
  projectName: z.string().optional(),
  includeMetadata: z.boolean().optional(),
  includeGenerationSummary: z.boolean().optional(),
});

export const JobPayloadSchema = z.union([
  DesignAnalysisJobPayloadSchema,
  GenerationPlanJobPayloadSchema,
  ReactProjectGenerationJobPayloadSchema,
  AutomaticRepairJobPayloadSchema,
  EditIntentAnalysisJobPayloadSchema,
  ProjectEditGenerationJobPayloadSchema,
  VisualCorrectionJobPayloadSchema,
  ExportPreparationJobPayloadSchema,
]);

export const JobStatusResponseSchema = z.object({
  jobId: z.string().uuid(),
  generationId: z.string().uuid(),
  jobType: BackgroundJobTypeSchema,
  status: BackgroundJobStatusSchema,
  progress: z.number().int().min(0).max(100),
  progressMessage: z.string().nullable(),
  attemptNumber: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  cancellationAllowed: z.boolean(),
  estimatedAiCostUsd: z.number().nonnegative().optional(),
  reservedAiCostUsd: z.number().nonnegative().optional(),
  actualAiCostUsd: z.number().nonnegative().optional(),
  estimatedTokens: z.number().int().nonnegative().optional(),
  actualTokens: z.number().int().nonnegative().optional(),
  usageLimitWarning: z.string().optional(),
});

export const JobListResponseSchema = z.object({
  generationId: z.string().uuid(),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  items: z.array(JobStatusResponseSchema),
});

export const JobAcceptedResponseSchema = z.object({
  jobId: z.string().uuid(),
  generationId: z.string().uuid(),
  jobType: BackgroundJobTypeSchema,
  status: BackgroundJobStatusSchema,
  createdAt: z.string().datetime(),
  statusUrl: z.string(),
  estimatedAiCostUsd: z.number().nonnegative().optional(),
  reservedAiCostUsd: z.number().nonnegative().optional(),
  estimatedTokens: z.number().int().nonnegative().optional(),
  usageLimitWarning: z.string().optional(),
});

export type BackgroundJobType = z.infer<typeof BackgroundJobTypeSchema>;
export type BackgroundJobStatus = z.infer<typeof BackgroundJobStatusSchema>;
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
export type JobListResponse = z.infer<typeof JobListResponseSchema>;
export type JobAcceptedResponse = z.infer<typeof JobAcceptedResponseSchema>;
