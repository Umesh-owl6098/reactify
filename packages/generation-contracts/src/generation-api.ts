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

export const GenerationErrorSchema = z.object({
  stage: PipelineStageNameSchema,
  code: z.string(),
  message: z.string(),
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
  featureFlags: GenerationFeatureFlagsSchema,
  errors: z.array(GenerationErrorSchema),
  durations: GenerationDurationsSchema,
});

export type GenerationUserStatus = z.infer<typeof GenerationUserStatusSchema>;
export type CreateGenerationRequest = z.infer<typeof CreateGenerationRequestSchema>;
export type CreateGenerationResponse = z.infer<typeof CreateGenerationResponseSchema>;
export type ConfirmPlanRequest = z.infer<typeof ConfirmPlanRequestSchema>;
export type ConfirmPlanResponse = z.infer<typeof ConfirmPlanResponseSchema>;
export type CancelGenerationResponse = z.infer<typeof CancelGenerationResponseSchema>;
export type GenerationStatusResponse = z.infer<typeof GenerationStatusResponseSchema>;
