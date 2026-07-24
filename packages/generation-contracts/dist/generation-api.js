import { z } from "zod";
import { DesignAnalysisV1Schema } from "./design-analysis.js";
import { GeneratedProjectV1Schema } from "./generated-project.js";
import { GenerationPlanV1Schema } from "./generation-plan.js";
import { PipelineStageLogEntrySchema, PipelineStageNameSchema } from "./pipeline.js";
export const GenerationUserStatusSchema = z.enum([
    "Queued",
    "Uploading",
    "Analyzing",
    "Planning",
    "Generating",
    "Validating",
    "Compiling",
    "Repairing",
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
    generatedProject: GeneratedProjectV1Schema.nullable(),
});
export const GenerationDurationsSchema = z.object({
    totalMs: z.number().nonnegative(),
    stages: z.record(z.number().nonnegative()),
});
export const CreateGenerationRequestSchema = z.object({
    imageId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
});
export const CreateGenerationResponseSchema = z.object({
    generationId: z.string().uuid(),
});
export const GenerationStatusResponseSchema = z.object({
    id: z.string().uuid(),
    imageId: z.string().uuid(),
    projectId: z.string().uuid(),
    status: GenerationUserStatusSchema,
    activeStage: PipelineStageNameSchema.nullable(),
    stages: z.array(PipelineStageLogEntrySchema),
    outputs: GenerationOutputsSchema,
    errors: z.array(GenerationErrorSchema),
    durations: GenerationDurationsSchema,
});
//# sourceMappingURL=generation-api.js.map