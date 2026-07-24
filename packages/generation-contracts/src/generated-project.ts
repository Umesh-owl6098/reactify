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

export const GeneratedComponentRecordSchema = z.object({
  name: z.string(),
  filePath: z.string(),
  exported: z.boolean(),
  props: z.array(PropDefinitionSchema),
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
  components: z.array(GeneratedComponentRecordSchema),
  warnings: z.array(z.string()),
});

export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
export type GeneratedProjectV1 = z.infer<typeof GeneratedProjectV1Schema>;
export type ComponentMetadata = z.infer<typeof ComponentMetadataSchema>;
export type GeneratedComponentRecord = z.infer<typeof GeneratedComponentRecordSchema>;
