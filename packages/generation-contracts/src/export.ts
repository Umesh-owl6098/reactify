import { z } from "zod";

export const ExportValidationStatusSchema = z.enum(["passed", "failed", "skipped"]);

export const ExportRequestSchema = z.object({
  projectName: z.string().max(128).optional(),
  includeMetadata: z.boolean().optional().default(true),
  includeGenerationSummary: z.boolean().optional().default(false),
});

export const ExportManifestValidationStatusSchema = z.object({
  schema: z.literal("passed"),
  static: z.literal("passed"),
  compilation: z.literal("passed"),
  runtime: z.literal("passed"),
});

export const ExportManifestFileSchema = z.object({
  path: z.string(),
  sizeBytes: z.number().nonnegative(),
  contentHash: z.string(),
});

export const ExportManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  exportId: z.string().uuid(),
  generationId: z.string().uuid(),
  versionId: z.string(),
  versionNumber: z.number().int().positive(),
  projectName: z.string(),
  projectHash: z.string(),
  exportedAt: z.string().datetime(),
  fileCount: z.number().nonnegative(),
  totalSizeBytes: z.number().nonnegative(),
  validationStatus: ExportManifestValidationStatusSchema,
  files: z.array(ExportManifestFileSchema),
  dependencies: z.record(z.string()),
  devDependencies: z.record(z.string()),
});

export const ExportStatusSchema = z.enum(["preparing", "ready", "failed"]);

export const ExportSummarySchema = z.object({
  exportId: z.string().uuid(),
  status: ExportStatusSchema,
  filename: z.string(),
  projectName: z.string(),
  generationId: z.string().uuid(),
  versionId: z.string(),
  versionNumber: z.number().int().positive(),
  projectHash: z.string(),
  fileCount: z.number().nonnegative(),
  totalSizeBytes: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  failureReason: z.string().optional(),
});

export const ExportHistoryListResponseSchema = z.object({
  generationId: z.string().uuid(),
  exports: z.array(ExportSummarySchema),
});

export const ExportDetailResponseSchema = z.object({
  generationId: z.string().uuid(),
  export: ExportSummarySchema,
});

export const ExportBlockedReasonSchema = z.enum([
  "project_not_found",
  "active_version_not_found",
  "project_not_validated",
  "awaiting_plan_confirmation",
  "awaiting_sandbox_validation",
  "repair_in_progress",
  "generation_cancelled",
  "generation_failed",
  "repair_failed",
  "export_in_progress",
  "edit_in_progress",
  "project_integrity_failed",
  "generation_in_progress",
]);

export type ExportRequest = z.infer<typeof ExportRequestSchema>;
export type ExportManifest = z.infer<typeof ExportManifestSchema>;
export type ExportSummary = z.infer<typeof ExportSummarySchema>;
export type ExportHistoryListResponse = z.infer<typeof ExportHistoryListResponseSchema>;
export type ExportDetailResponse = z.infer<typeof ExportDetailResponseSchema>;
export type ExportBlockedReason = z.infer<typeof ExportBlockedReasonSchema>;
