import { z } from "zod";

export const NaturalLanguageEditRequestSchema = z.object({
  instruction: z.string(),
  selectedFiles: z.array(z.string()).optional(),
  selectedComponentIds: z.array(z.string()).optional(),
  expectedProjectHash: z.string(),
});

export const EditIntentTypeSchema = z.enum([
  "style_change",
  "content_change",
  "layout_change",
  "component_addition",
  "component_removal",
  "behavior_change",
  "responsive_change",
  "accessibility_change",
  "bug_fix",
  "mixed",
]);

export const EditIntentV1Schema = z.object({
  schemaVersion: z.literal("1"),
  responseVersion: z.string(),
  summary: z.string(),
  intentType: EditIntentTypeSchema,
  affectedFiles: z.array(z.string()),
  affectedComponents: z.array(z.string()),
  requiresDependencyChange: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  assumptions: z.array(z.string()),
  clarificationRequired: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

export const ProjectEditChangedFileSchema = z.object({
  path: z.string(),
  fullContent: z.string(),
  language: z.enum(["tsx", "ts", "css", "json", "html", "js"]),
  reason: z.string(),
});

export const ProjectEditDependencyChangeSchema = z.object({
  packageName: z.string(),
  action: z.enum(["add", "update", "remove"]),
  targetGroup: z.enum(["dependencies", "devDependencies"]),
  version: z.string().optional(),
  reason: z.string(),
});

export const ProjectEditV1Schema = z.object({
  schemaVersion: z.literal("1"),
  responseVersion: z.string(),
  editSummary: z.string(),
  interpretedInstruction: z.string(),
  changedFiles: z.array(ProjectEditChangedFileSchema),
  deletedFiles: z.array(z.string()).default([]),
  dependencyChanges: z.array(ProjectEditDependencyChangeSchema).default([]),
  affectedComponents: z.array(z.string()).default([]),
  expectedVisualChanges: z.array(z.string()).default([]),
  expectedBehaviorChanges: z.array(z.string()).default([]),
  unresolvedRisks: z.array(z.string()).default([]),
});

export const EditOperationStatusSchema = z.enum([
  "analyzing",
  "clarification_required",
  "awaiting_confirmation",
  "generating_patch",
  "validating_patch",
  "applying_patch",
  "awaiting_sandbox_validation",
  "completed",
  "failed",
  "cancelled",
]);

export const EditOperationSummarySchema = z.object({
  editId: z.string().uuid(),
  generationId: z.string().uuid(),
  status: EditOperationStatusSchema,
  instruction: z.string(),
  intent: EditIntentV1Schema.optional(),
  sourceVersionId: z.string(),
  createdVersionId: z.string().optional(),
  projectHashBefore: z.string(),
  projectHashAfter: z.string().optional(),
  changedFiles: z.array(z.string()),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  failureReason: z.string().optional(),
  clarificationQuestion: z.string().optional(),
  confirmationRequired: z.boolean().optional(),
  versionNumber: z.number().int().positive().optional(),
});

export const EditClarificationRequestSchema = z.object({
  answer: z.string(),
  expectedProjectHash: z.string(),
});

export const EditConfirmationRequestSchema = z.object({
  expectedProjectHash: z.string(),
  confirmed: z.literal(true),
});

export const EditHistoryListResponseSchema = z.object({
  generationId: z.string().uuid(),
  edits: z.array(EditOperationSummarySchema),
});

export const EditDetailResponseSchema = z.object({
  generationId: z.string().uuid(),
  edit: EditOperationSummarySchema,
});

export const EditBlockedReasonSchema = z.enum([
  "generation_not_found",
  "active_version_not_found",
  "project_integrity_failed",
  "awaiting_plan_confirmation",
  "generation_in_progress",
  "generation_cancelled",
  "repair_in_progress",
  "rollback_in_progress",
  "export_in_progress",
  "edit_in_progress",
  "project_not_validated",
  "edit_not_allowed",
]);

export type NaturalLanguageEditRequest = z.infer<typeof NaturalLanguageEditRequestSchema>;
export type EditIntentV1 = z.infer<typeof EditIntentV1Schema>;
export type ProjectEditV1 = z.infer<typeof ProjectEditV1Schema>;
export type EditOperationSummary = z.infer<typeof EditOperationSummarySchema>;
export type EditClarificationRequest = z.infer<typeof EditClarificationRequestSchema>;
export type EditConfirmationRequest = z.infer<typeof EditConfirmationRequestSchema>;
export type EditHistoryListResponse = z.infer<typeof EditHistoryListResponseSchema>;
export type EditDetailResponse = z.infer<typeof EditDetailResponseSchema>;
export type EditBlockedReason = z.infer<typeof EditBlockedReasonSchema>;
