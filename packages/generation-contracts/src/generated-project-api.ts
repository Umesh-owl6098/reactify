import { z } from "zod";
import { GeneratedFileSchema } from "./generated-project.js";

export const GeneratedFileMetadataSchema = GeneratedFileSchema.omit({ content: true, componentMetadata: true }).extend({
  sizeBytes: z.number().int().nonnegative(),
});

export const GeneratedProjectSummarySchema = z.object({
  schemaVersion: z.literal("1"),
  responseVersion: z.string(),
  projectName: z.string(),
  summary: z.string(),
  generationPlanRef: z.string().uuid().optional(),
  designAnalysisRef: z.string().uuid().optional(),
  dependencies: z.record(z.string()),
  devDependencies: z.record(z.string()).optional(),
  files: z.array(GeneratedFileMetadataSchema),
  entryFile: z.string(),
  warnings: z.array(z.string()),
  components: z.array(
    z.object({
      name: z.string(),
      filePath: z.string(),
      exported: z.boolean(),
      props: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          required: z.boolean(),
          description: z.string(),
        }),
      ),
      dependencies: z.array(z.string()),
      accessibilityNotes: z.string(),
    }),
  ),
});

export const GeneratedFileListResponseSchema = z.object({
  generationId: z.string().uuid(),
  files: z.array(GeneratedFileMetadataSchema),
});

export const GeneratedFileContentResponseSchema = z.object({
  path: z.string(),
  language: z.enum(["tsx", "ts", "css", "json", "html", "js"]),
  content: z.string(),
});

export type GeneratedFileMetadata = z.infer<typeof GeneratedFileMetadataSchema>;
export type GeneratedProjectSummary = z.infer<typeof GeneratedProjectSummarySchema>;
export type GeneratedFileListResponse = z.infer<typeof GeneratedFileListResponseSchema>;
export type GeneratedFileContentResponse = z.infer<typeof GeneratedFileContentResponseSchema>;
