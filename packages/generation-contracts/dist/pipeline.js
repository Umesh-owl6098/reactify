import { z } from "zod";
export const PipelineStageNameSchema = z.enum([
    "upload_validation",
    "image_preparation",
    "design_analysis",
    "generation_plan_creation",
    "generation_plan_review",
    "react_project_generation",
    "schema_validation",
    "static_validation",
    "sandbox_compilation",
    "runtime_validation",
    "automatic_repair",
    "preview_ready",
]);
export const PipelineStageStatusSchema = z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "skipped",
    "cancelled",
]);
export const PipelineStageLogEntrySchema = z.object({
    stage: PipelineStageNameSchema,
    status: PipelineStageStatusSchema,
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    durationMs: z.number().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
});
export const PIPELINE_STAGE_ORDER = PipelineStageNameSchema.options;
//# sourceMappingURL=pipeline.js.map