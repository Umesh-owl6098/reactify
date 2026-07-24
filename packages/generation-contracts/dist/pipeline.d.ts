import { z } from "zod";
export declare const PipelineStageNameSchema: z.ZodEnum<["upload_validation", "image_preparation", "design_analysis", "generation_plan_creation", "generation_plan_review", "react_project_generation", "schema_validation", "static_validation", "sandbox_compilation", "runtime_validation", "automatic_repair", "preview_ready"]>;
export declare const PipelineStageStatusSchema: z.ZodEnum<["pending", "running", "completed", "failed", "skipped", "cancelled"]>;
export declare const PipelineStageLogEntrySchema: z.ZodObject<{
    stage: z.ZodEnum<["upload_validation", "image_preparation", "design_analysis", "generation_plan_creation", "generation_plan_review", "react_project_generation", "schema_validation", "static_validation", "sandbox_compilation", "runtime_validation", "automatic_repair", "preview_ready"]>;
    status: z.ZodEnum<["pending", "running", "completed", "failed", "skipped", "cancelled"]>;
    startedAt: z.ZodOptional<z.ZodString>;
    completedAt: z.ZodOptional<z.ZodString>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    errorCode: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
    stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
    startedAt?: string | undefined;
    completedAt?: string | undefined;
    durationMs?: number | undefined;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
}, {
    status: "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
    stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
    startedAt?: string | undefined;
    completedAt?: string | undefined;
    durationMs?: number | undefined;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
}>;
export declare const PIPELINE_STAGE_ORDER: ["upload_validation", "image_preparation", "design_analysis", "generation_plan_creation", "generation_plan_review", "react_project_generation", "schema_validation", "static_validation", "sandbox_compilation", "runtime_validation", "automatic_repair", "preview_ready"];
export type PipelineStageName = z.infer<typeof PipelineStageNameSchema>;
export type PipelineStageStatus = z.infer<typeof PipelineStageStatusSchema>;
export type PipelineStageLogEntry = z.infer<typeof PipelineStageLogEntrySchema>;
//# sourceMappingURL=pipeline.d.ts.map