import { z } from "zod";
const SAFE_PATH_RE = /^[a-zA-Z0-9_\-./]+$/;
export const PropDefinitionSchema = z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean(),
    description: z.string(),
});
export const ComponentMetadataSchema = z.object({
    name: z.string(),
    purpose: z.string(),
    props: z.array(PropDefinitionSchema),
    children: z.boolean(),
    dependencies: z.array(z.string()),
    accessibilityNotes: z.string(),
});
export const GeneratedFileSchema = z.object({
    path: z
        .string()
        .regex(SAFE_PATH_RE, "Unsafe characters in path")
        .refine((p) => !p.startsWith("/"), "No absolute paths")
        .refine((p) => !p.includes("../"), "No directory traversal"),
    language: z.enum(["tsx", "ts", "css", "json", "html", "js"]),
    content: z.string().min(1),
    purpose: z.string(),
    componentMetadata: ComponentMetadataSchema.optional(),
});
export const GeneratedProjectV1Schema = z.object({
    schemaVersion: z.literal("1"),
    responseVersion: z.string(),
    projectName: z.string(),
    summary: z.string(),
    generationPlanRef: z.string().uuid().optional(),
    designAnalysisRef: z.string().uuid().optional(),
    dependencies: z.record(z.string()),
    devDependencies: z.record(z.string()).optional(),
    files: z.array(GeneratedFileSchema).min(1),
    entryFile: z.string(),
    warnings: z.array(z.string()),
});
//# sourceMappingURL=generated-project.js.map