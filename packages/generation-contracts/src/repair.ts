import { z } from "zod";
import { DiagnosticSchema } from "./sandbox-validation.js";
import { SandboxValidationSnapshotSchema } from "./sandbox-validation.js";
import { StaticValidationResultSchema } from "./validation-results.js";
import { PatchChangedFileSchema, PatchDeletedFileSchema, PatchDependencyChangeSchema } from "./project-patch.js";

export const RepairAttemptStatusSchema = z.enum([
  "pending",
  "waiting_for_revalidation",
  "succeeded",
  "failed",
  "cancelled",
]);

export const RepairStatusSchema = z.enum([
  "not_required",
  "analyzing",
  "generating_patch",
  "validating_patch",
  "applying_patch",
  "waiting_for_revalidation",
  "succeeded",
  "failed",
  "exhausted",
  "not_possible",
]);

export const RepairabilityClassificationSchema = z.object({
  repairable: z.boolean(),
  reasons: z.array(z.string()),
});

export const RepairChangedFileRecordSchema = PatchChangedFileSchema.extend({
  beforeContent: z.string().optional(),
  afterContent: z.string(),
});

export const RepairAttemptRecordSchema = z.object({
  attemptNumber: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  status: RepairAttemptStatusSchema,
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  diagnosticsBefore: z.array(DiagnosticSchema),
  repairabilityClassification: RepairabilityClassificationSchema,
  patchSummary: z.string().optional(),
  changedFiles: z.array(RepairChangedFileRecordSchema),
  deletedFiles: z.array(PatchDeletedFileSchema),
  dependencyChanges: z.array(PatchDependencyChangeSchema),
  projectHashBefore: z.string(),
  projectHashAfter: z.string().optional(),
  staticValidationAfter: StaticValidationResultSchema.optional(),
  sandboxValidationAfter: SandboxValidationSnapshotSchema.optional(),
  failureReason: z.string().optional(),
  repeatedPatchDetected: z.boolean(),
  repeatedDiagnosticsDetected: z.boolean(),
  unresolvedRisks: z.array(z.string()),
});

export const RepairHistorySummarySchema = z.object({
  attemptNumber: z.number().int().positive(),
  status: RepairAttemptStatusSchema,
  patchSummary: z.string().optional(),
  changedFileCount: z.number().nonnegative(),
  failureReason: z.string().optional(),
  completedAt: z.string().datetime().optional(),
});

export const RepairStatusSnapshotSchema = z.object({
  repairRequired: z.boolean(),
  repairStatus: RepairStatusSchema,
  currentAttempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  manualRetryAllowed: z.boolean(),
  clientRevalidationRequired: z.boolean(),
  latestPatchSummary: z.string().nullable(),
  changedFiles: z.array(z.string()),
  deletedFiles: z.array(z.string()),
  dependencyChanges: z.array(PatchDependencyChangeSchema),
  unresolvedRisks: z.array(z.string()),
  latestDiagnostics: z.array(DiagnosticSchema),
  repairHistory: z.array(RepairHistorySummarySchema),
});

export const RepairHistoryListResponseSchema = z.object({
  generationId: z.string().uuid(),
  attempts: z.array(RepairHistorySummarySchema),
});

export const RepairAttemptDetailResponseSchema = z.object({
  generationId: z.string().uuid(),
  attempt: RepairAttemptRecordSchema,
});

export const RepairRetryResponseSchema = z.object({
  status: RepairStatusSchema,
});

export type RepairAttemptStatus = z.infer<typeof RepairAttemptStatusSchema>;
export type RepairStatus = z.infer<typeof RepairStatusSchema>;
export type RepairabilityClassification = z.infer<typeof RepairabilityClassificationSchema>;
export type RepairAttemptRecord = z.infer<typeof RepairAttemptRecordSchema>;
export type RepairHistorySummary = z.infer<typeof RepairHistorySummarySchema>;
export type RepairStatusSnapshot = z.infer<typeof RepairStatusSnapshotSchema>;
export type RepairHistoryListResponse = z.infer<typeof RepairHistoryListResponseSchema>;
export type RepairAttemptDetailResponse = z.infer<typeof RepairAttemptDetailResponseSchema>;
export type RepairRetryResponse = z.infer<typeof RepairRetryResponseSchema>;
