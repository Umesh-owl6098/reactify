import { z } from "zod";

export const ProjectVersionSourceSchema = z.enum([
  "initial_generation",
  "automatic_repair",
  "rollback",
  "natural_language_edit",
  "visual_correction",
]);

export const ProjectVersionSummarySchema = z.object({
  versionId: z.string(),
  versionNumber: z.number().int().positive(),
  source: ProjectVersionSourceSchema,
  label: z.string(),
  parentVersionId: z.string().nullable(),
  projectHash: z.string(),
  changedFiles: z.array(z.string()),
  editId: z.string().uuid().optional(),
  instruction: z.string().optional(),
  createdAt: z.string().datetime(),
  isActive: z.boolean(),
});

export const ProjectVersionListResponseSchema = z.object({
  generationId: z.string().uuid(),
  activeVersionId: z.string().nullable(),
  versions: z.array(ProjectVersionSummarySchema),
});

export const RollbackVersionRequestSchema = z.object({
  expectedProjectHash: z.string(),
});

export const RollbackVersionResponseSchema = z.object({
  versionId: z.string(),
  versionNumber: z.number().int().positive(),
  projectHash: z.string(),
  source: z.literal("rollback"),
});

export type ProjectVersionSource = z.infer<typeof ProjectVersionSourceSchema>;
export type ProjectVersionSummary = z.infer<typeof ProjectVersionSummarySchema>;
export type ProjectVersionListResponse = z.infer<typeof ProjectVersionListResponseSchema>;
export type RollbackVersionRequest = z.infer<typeof RollbackVersionRequestSchema>;
export type RollbackVersionResponse = z.infer<typeof RollbackVersionResponseSchema>;
