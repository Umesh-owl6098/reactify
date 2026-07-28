import { z } from "zod";
import { AnalysisMetadataSchema } from "./analysis-metadata.js";
import { DesignAnalysisV1Schema } from "./design-analysis.js";
import { GeneratedProjectSummarySchema } from "./generated-project-api.js";
import { GenerationPlanV1Schema } from "./generation-plan.js";
import { PlanMetadataSchema } from "./plan-metadata.js";
import { ProjectMetadataSchema } from "./project-metadata.js";
import { PipelineStageLogEntrySchema, PipelineStageNameSchema } from "./pipeline.js";
import { SchemaValidationResultSchema, StaticValidationResultSchema } from "./validation-results.js";
import { SandboxValidationSnapshotSchema } from "./sandbox-validation.js";
import { RepairStatusSnapshotSchema } from "./repair.js";
import { ExportBlockedReasonSchema, ExportSummarySchema } from "./export.js";
import { EditBlockedReasonSchema, EditOperationSummarySchema } from "./edit.js";
import {
  VisualComparisonBlockedReasonSchema,
  VisualComparisonResultSchema,
} from "./visual-comparison.js";

export const GenerationUserStatusSchema = z.enum([
  "Queued",
  "Uploading",
  "Analyzing",
  "Planning",
  "Generating",
  "Validating",
  "Compiling",
  "Repairing",
  "RepairRequired",
  "RepairFailed",
  "Ready",
  "Failed",
  "Cancelled",
]);

export const GenerationValidationIssueSchema = z.object({
  path: z.string().max(200),
  code: z.string().max(100),
  message: z.string().max(500),
});

export const GenerationErrorSchema = z.object({
  stage: PipelineStageNameSchema,
  code: z.string(),
  message: z.string(),
  provider: z.string().max(100).optional(),
  model: z.string().max(200).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  providerRequestId: z.string().max(200).optional(),
  retryable: z.boolean().optional(),
  validationIssues: z.array(GenerationValidationIssueSchema).max(8).optional(),
});

export const GenerationOutputsSchema = z.object({
  designAnalysis: DesignAnalysisV1Schema.nullable(),
  generationPlan: GenerationPlanV1Schema.nullable(),
  generatedProject: GeneratedProjectSummarySchema.nullable(),
});

export const GenerationDurationsSchema = z.object({
  totalMs: z.number().nonnegative(),
  stages: z.record(z.number().nonnegative()),
});

export const GenerationFeatureFlagsSchema = z.object({
  enableGenerationPlanEditing: z.boolean(),
});

export const CreateGenerationRequestSchema = z.object({
  imageId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
});

export const CreateGenerationResponseSchema = z.object({
  generationId: z.string().uuid(),
});

export const ConfirmPlanRequestSchema = z.object({
  plan: GenerationPlanV1Schema,
});

export const ConfirmPlanResponseSchema = z.object({
  status: GenerationUserStatusSchema,
});

export const CancelGenerationResponseSchema = z.object({
  status: z.literal("Cancelled"),
});

export const GenerationSummarySchema = z.object({
  generationId: z.string().uuid(),
  status: GenerationUserStatusSchema,
  sourceImageFilename: z.string().nullable(),
  currentStage: PipelineStageNameSchema.nullable(),
  activeVersionNumber: z.number().int().positive().nullable(),
  latestProjectHash: z.string().nullable(),
  latestSimilarityScore: z.number().min(0).max(100).nullable(),
  repairCount: z.number().int().nonnegative(),
  editCount: z.number().int().nonnegative(),
  versionCount: z.number().int().nonnegative(),
  exportCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const GenerationListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  items: z.array(GenerationSummarySchema),
});

export const DeleteGenerationResponseSchema = z.object({
  generationId: z.string().uuid(),
  deletedAt: z.string().datetime(),
});

export const GenerationStatusResponseSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: GenerationUserStatusSchema,
  activeStage: PipelineStageNameSchema.nullable(),
  stages: z.array(PipelineStageLogEntrySchema),
  outputs: GenerationOutputsSchema,
  analysis: AnalysisMetadataSchema.nullable(),
  plan: PlanMetadataSchema.nullable(),
  project: ProjectMetadataSchema.nullable(),
  schemaValidation: SchemaValidationResultSchema.nullable(),
  staticValidation: StaticValidationResultSchema.nullable(),
  sandboxValidation: SandboxValidationSnapshotSchema.nullable(),
  projectHash: z.string().nullable(),
  editedByUser: z.boolean(),
  confirmedAt: z.string().datetime().nullable(),
  awaitingPlanConfirmation: z.boolean(),
  awaitingSandboxValidation: z.boolean(),
  repair: RepairStatusSnapshotSchema.nullable(),
  exportAllowed: z.boolean(),
  exportBlockedReason: ExportBlockedReasonSchema.nullable(),
  latestExportSummary: ExportSummarySchema.nullable(),
  editAllowed: z.boolean(),
  editBlockedReason: EditBlockedReasonSchema.nullable(),
  activeEditId: z.string().uuid().nullable(),
  activeEditStatus: EditOperationSummarySchema.shape.status.nullable(),
  clarificationRequired: z.boolean(),
  clarificationQuestion: z.string().nullable(),
  latestEditSummary: EditOperationSummarySchema.nullable(),
  activeVersionId: z.string().nullable(),
  activeVersionNumber: z.number().int().positive().nullable(),
  sandboxRevalidationRequired: z.boolean(),
  visualComparisonAllowed: z.boolean(),
  visualComparisonBlockedReason: VisualComparisonBlockedReasonSchema.nullable(),
  activeComparisonId: z.string().uuid().nullable(),
  activeComparisonStatus: VisualComparisonResultSchema.shape.status.nullable(),
  latestSimilarityScore: z.number().min(0).max(100).nullable(),
  latestDifferencePercentage: z.number().min(0).max(100).nullable(),
  visualCorrectionAvailable: z.boolean(),
  visualCorrectionStatus: VisualComparisonResultSchema.shape.status.nullable(),
  visualCorrectionAttempt: z.number().int().nonnegative(),
  visualCorrectionMaxAttempts: z.number().int().positive(),
  previewCaptureRequired: z.boolean(),
  featureFlags: GenerationFeatureFlagsSchema,
  manualRetryAllowed: z.boolean(),
  retryAllowed: z.boolean(),
  errors: z.array(GenerationErrorSchema),
  durations: GenerationDurationsSchema,
});

export type GenerationUserStatus = z.infer<typeof GenerationUserStatusSchema>;
export type GenerationValidationIssue = z.infer<typeof GenerationValidationIssueSchema>;
export type GenerationError = z.infer<typeof GenerationErrorSchema>;
export type CreateGenerationRequest = z.infer<typeof CreateGenerationRequestSchema>;
export type CreateGenerationResponse = z.infer<typeof CreateGenerationResponseSchema>;
export type ConfirmPlanRequest = z.infer<typeof ConfirmPlanRequestSchema>;
export type ConfirmPlanResponse = z.infer<typeof ConfirmPlanResponseSchema>;
export type CancelGenerationResponse = z.infer<typeof CancelGenerationResponseSchema>;
export type GenerationSummary = z.infer<typeof GenerationSummarySchema>;
export type GenerationListResponse = z.infer<typeof GenerationListResponseSchema>;
export type DeleteGenerationResponse = z.infer<typeof DeleteGenerationResponseSchema>;
export type GenerationStatusResponse = z.infer<typeof GenerationStatusResponseSchema>;
