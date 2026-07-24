import { z } from "zod";

export const PlannedPropSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string(),
});

export const PlannedComponentSchema = z.object({
  name: z.string(),
  type: z.string(),
  purpose: z.string(),
  props: z.array(PlannedPropSchema),
  children: z.boolean(),
  dependencies: z.array(z.string()),
  accessibilityNotes: z.string(),
});

export const PlannedFileSchema = z.object({
  path: z.string(),
  language: z.enum(["tsx", "ts", "css", "json", "html", "js"]),
  purpose: z.string(),
  components: z.array(z.string()),
});

export const DesignTokensSchema = z.object({
  colors: z.record(z.string()),
  typography: z.record(z.string()),
  spacing: z.record(z.string()),
  borderRadius: z.record(z.string()).optional(),
  shadows: z.record(z.string()).optional(),
});

export const GenerationPlanV1Schema = z.object({
  schemaVersion: z.literal("1"),
  responseVersion: z.string(),
  components: z.array(PlannedComponentSchema).min(1),
  files: z.array(PlannedFileSchema).min(1),
  designTokens: DesignTokensSchema,
  dependencies: z.record(z.string()),
  devDependencies: z.record(z.string()).optional(),
  responsiveStrategy: z.string(),
  accessibilityStrategy: z.string(),
  confidenceWarnings: z.array(z.string()),
});

export type GenerationPlanV1 = z.infer<typeof GenerationPlanV1Schema>;
export type PlannedComponent = z.infer<typeof PlannedComponentSchema>;
