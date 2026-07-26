import { z } from "zod";

export const VisualComparisonViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive().optional(),
});

export const VisualComparisonRequestSchema = z.object({
  expectedProjectHash: z.string(),
  viewport: VisualComparisonViewportSchema,
  includeCorrectionSuggestion: z.boolean().optional(),
});

export const PreviewScreenshotSubmissionSchema = z.object({
  expectedProjectHash: z.string(),
  viewport: VisualComparisonViewportSchema.extend({
    deviceScaleFactor: z.number().positive(),
  }),
  imageFormat: z.literal("png"),
  screenshotBase64: z.string(),
  capturedAt: z.string().datetime(),
});

export const VisualRegionDifferenceSchema = z.object({
  regionId: z.string(),
  bounds: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  differenceScore: z.number().min(0).max(100),
  severity: z.enum(["low", "medium", "high"]),
  likelyCategory: z.enum([
    "layout",
    "spacing",
    "color",
    "typography",
    "content",
    "missing_element",
    "extra_element",
    "alignment",
    "responsive",
    "unknown",
  ]),
  description: z.string(),
});

export const VisualComparisonStatusSchema = z.enum([
  "awaiting_capture",
  "processing",
  "completed",
  "failed",
  "correction_available",
  "correcting",
  "awaiting_revalidation",
]);

export const VisualComparisonResultSchema = z.object({
  comparisonId: z.string().uuid(),
  generationId: z.string().uuid(),
  versionId: z.string(),
  projectHash: z.string(),
  status: VisualComparisonStatusSchema,
  sourceImage: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  }),
  previewImage: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  }),
  viewport: VisualComparisonViewportSchema.extend({
    deviceScaleFactor: z.number().positive(),
  }),
  overallSimilarityScore: z.number().min(0).max(100),
  pixelDifferencePercentage: z.number().min(0).max(100),
  structuralDifferenceScore: z.number().min(0).max(100),
  regions: z.array(VisualRegionDifferenceSchema),
  summary: z.string(),
  correctionRecommended: z.boolean(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  failureReason: z.string().optional(),
  parentComparisonId: z.string().uuid().optional(),
  correctionAttemptNumber: z.number().int().nonnegative().optional(),
  improvementOutcome: z.enum(["improved", "unchanged", "regressed"]).optional(),
  baselineSimilarityScore: z.number().min(0).max(100).optional(),
});

export const VisualCorrectionChangedFileSchema = z.object({
  path: z.string(),
  fullContent: z.string(),
  language: z.enum(["tsx", "ts", "css", "json", "html", "js"]),
  reason: z.string(),
});

export const VisualCorrectionDependencyChangeSchema = z.object({
  packageName: z.string(),
  action: z.enum(["add", "update", "remove"]),
  targetGroup: z.enum(["dependencies", "devDependencies"]),
  version: z.string().optional(),
  reason: z.string(),
});

export const VisualCorrectionV1Schema = z.object({
  schemaVersion: z.literal("1"),
  responseVersion: z.string(),
  correctionSummary: z.string(),
  targetedRegions: z.array(z.string()),
  changedFiles: z.array(VisualCorrectionChangedFileSchema),
  deletedFiles: z.array(z.string()).default([]),
  dependencyChanges: z.array(VisualCorrectionDependencyChangeSchema).default([]),
  expectedImprovements: z.array(z.string()).default([]),
  unresolvedVisualRisks: z.array(z.string()).default([]),
});

export const VisualCorrectionRequestSchema = z.object({
  expectedProjectHash: z.string(),
});

export const VisualComparisonBlockedReasonSchema = z.enum([
  "generation_not_found",
  "source_image_not_found",
  "active_version_not_found",
  "preview_not_ready",
  "awaiting_plan_confirmation",
  "awaiting_sandbox_validation",
  "generation_in_progress",
  "generation_cancelled",
  "project_not_validated",
  "project_integrity_failed",
  "visual_comparison_in_progress",
  "visual_correction_in_progress",
  "edit_in_progress",
  "repair_in_progress",
  "rollback_in_progress",
  "export_in_progress",
  "comparison_not_allowed",
  "correction_attempts_exhausted",
]);

export const VisualComparisonHistoryListResponseSchema = z.object({
  generationId: z.string().uuid(),
  comparisons: z.array(VisualComparisonResultSchema),
});

export const VisualComparisonDetailResponseSchema = z.object({
  generationId: z.string().uuid(),
  comparison: VisualComparisonResultSchema,
});

export const VisualComparisonArtifactTypeSchema = z.enum(["source", "preview", "diff", "overlay", "regions"]);

export type VisualComparisonRequest = z.infer<typeof VisualComparisonRequestSchema>;
export type PreviewScreenshotSubmission = z.infer<typeof PreviewScreenshotSubmissionSchema>;
export type VisualRegionDifference = z.infer<typeof VisualRegionDifferenceSchema>;
export type VisualComparisonResult = z.infer<typeof VisualComparisonResultSchema>;
export type VisualComparisonStatus = z.infer<typeof VisualComparisonStatusSchema>;
export type VisualCorrectionV1 = z.infer<typeof VisualCorrectionV1Schema>;
export type VisualCorrectionRequest = z.infer<typeof VisualCorrectionRequestSchema>;
export type VisualComparisonBlockedReason = z.infer<typeof VisualComparisonBlockedReasonSchema>;
export type VisualComparisonArtifactType = z.infer<typeof VisualComparisonArtifactTypeSchema>;
