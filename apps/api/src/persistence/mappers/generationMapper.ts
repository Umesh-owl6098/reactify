import type { Prisma } from "@prisma/client";
import {
  DesignAnalysisV1Schema,
  GeneratedProjectV1Schema,
  GenerationPlanV1Schema,
  PipelineStageLogEntrySchema,
  RepairAttemptRecordSchema,
  VisualComparisonResultSchema,
} from "@reactify/generation-contracts";
import type { GenerationUserStatus } from "@reactify/generation-contracts";
import type { InternalExportRecord } from "../../lib/export/ExportService.js";
import type { InternalEditRecord } from "../../lib/edit/EditService.js";
import type { InternalVisualComparisonRecord } from "../../lib/visual-comparison/VisualComparisonService.js";
import type { GenerationRecord, ProjectVersionRecord } from "../../pipeline/types.js";
import type { InternalRepairAttemptRecord } from "../../pipeline/types.js";
import { PersistenceError } from "../errors.js";
import { ErrorCode } from "@reactify/shared";

type LoadedGeneration = Prisma.GenerationGetPayload<{
  include: {
    stages: true;
    versions: true;
    repairAttempts: true;
    edits: { include: { clarifications: true } };
    visualComparisons: { include: { correctionAttempts: true } };
    exports: true;
  };
}>;

function parseJson<T>(schema: { safeParse: (input: unknown) => { success: boolean; data?: T } }, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new PersistenceError(`Persisted ${label} is invalid.`, ErrorCode.PERSISTED_DATA_INVALID);
  }
  return result.data;
}

function mapVersion(row: LoadedGeneration["versions"][number]): ProjectVersionRecord {
  const project = parseJson(GeneratedProjectV1Schema, row.projectSnapshot, "project version snapshot");
  return {
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    source: row.source as ProjectVersionRecord["source"],
    label: row.label,
    parentVersionId: row.parentVersionId,
    projectHash: row.projectHash,
    project,
    changedFiles: Array.isArray(row.changedFiles) ? (row.changedFiles as string[]) : [],
    editId: row.editId ?? undefined,
    instruction: row.instruction ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapRepair(row: LoadedGeneration["repairAttempts"][number]): InternalRepairAttemptRecord {
  return parseJson(RepairAttemptRecordSchema, {
    attemptNumber: row.attemptNumber,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    latencyMs: row.latencyMs,
    diagnosticsBefore: row.diagnosticsBefore,
    repairabilityClassification: row.repairabilityClassification,
    patchSummary: row.patchSummary ?? undefined,
    changedFiles: row.changedFiles,
    deletedFiles: row.deletedFiles,
    dependencyChanges: row.dependencyChanges,
    projectHashBefore: row.projectHashBefore,
    projectHashAfter: row.projectHashAfter ?? undefined,
    staticValidationAfter: row.staticValidationAfter ?? undefined,
    sandboxValidationAfter: row.sandboxValidationAfter ?? undefined,
    failureReason: row.failureReason ?? undefined,
    repeatedPatchDetected: row.repeatedPatchDetected,
    repeatedDiagnosticsDetected: row.repeatedDiagnosticsDetected,
    unresolvedRisks: row.unresolvedRisks,
  }, "repair attempt") as InternalRepairAttemptRecord & {
    patchFingerprint?: string;
    diagnosticsFingerprint?: string;
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapEdit(row: LoadedGeneration["edits"][number]): InternalEditRecord {
  return {
    editId: row.editId,
    generationId: row.generationId,
    status: row.status as InternalEditRecord["status"],
    instruction: row.instruction,
    intent: (row.intent as InternalEditRecord["intent"]) ?? undefined,
    sourceVersionId: row.sourceVersionId,
    createdVersionId: row.createdVersionId ?? undefined,
    projectHashBefore: row.projectHashBefore ?? "",
    projectHashAfter: row.projectHashAfter ?? undefined,
    changedFiles: Array.isArray(row.changedFiles) ? (row.changedFiles as string[]) : [],
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    failureReason: row.failureReason ?? undefined,
    clarificationQuestion: row.clarificationQuestion ?? undefined,
    confirmationRequired: row.confirmationRequired,
    versionNumber: row.versionNumber ?? undefined,
    idempotencyFingerprint: row.idempotencyFingerprint ?? undefined,
    pendingEdit: (row.pendingEdit as InternalEditRecord["pendingEdit"]) ?? undefined,
    pendingIntent: (row.pendingIntent as InternalEditRecord["pendingIntent"]) ?? undefined,
    selectedFiles: Array.isArray(row.selectedFiles) ? (row.selectedFiles as string[]) : [],
    selectedComponentIds: Array.isArray(row.selectedComponentIds) ? (row.selectedComponentIds as string[]) : [],
    clarificationAnswers: Array.isArray(row.clarificationAnswers) ? (row.clarificationAnswers as string[]) : [],
    clarificationRound: row.clarificationRound,
    resolvedInstruction: row.resolvedInstruction,
  };
}

function mapComparison(row: LoadedGeneration["visualComparisons"][number]): InternalVisualComparisonRecord {
  const comparison = parseJson(VisualComparisonResultSchema, {
    comparisonId: row.comparisonId,
    generationId: row.generationId,
    versionId: row.versionId,
    projectHash: row.projectHash,
    status: row.status,
    sourceImage: (row.artifactReferences as { sourceImage?: string })?.sourceImage ?? "",
    previewImage: (row.artifactReferences as { previewImage?: string })?.previewImage ?? "",
    viewport: row.viewport,
    overallSimilarityScore: row.similarityScore ?? 0,
    pixelDifferencePercentage: row.pixelDifferencePercentage ?? 0,
    structuralDifferenceScore: row.structuralDifferenceScore ?? 0,
    regions: row.regions,
    summary: row.summary ?? "",
    correctionRecommended: row.correctionRecommended,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    failureReason: undefined,
    parentComparisonId: undefined,
    correctionAttemptNumber: row.correctionAttempts.length,
    improvementOutcome: undefined,
    baselineSimilarityScore: undefined,
  }, "visual comparison");

  return {
    ...comparison,
    idempotencyFingerprint: row.idempotencyFingerprint ?? undefined,
    screenshotSubmitted: row.screenshotSubmitted,
  };
}

function mapExport(row: LoadedGeneration["exports"][number]): InternalExportRecord {
  return {
    exportId: row.exportId,
    status: row.status as InternalExportRecord["status"],
    filename: row.filename,
    projectName: row.projectName,
    generationId: row.generationId,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    projectHash: row.projectHash,
    fileCount: row.fileCount,
    totalSizeBytes: row.totalSizeBytes,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    failureReason: row.failureReason ?? undefined,
    idempotencyFingerprint: row.idempotencyFingerprint ?? undefined,
  };
}

export function mapLoadedGenerationToRecord(row: LoadedGeneration): GenerationRecord {
  const mappedStages = row.stages.map((stage) =>
    PipelineStageLogEntrySchema.parse({
      stage: stage.stageName,
      status: stage.status,
      startedAt: stage.startedAt?.toISOString(),
      completedAt: stage.completedAt?.toISOString(),
      durationMs: stage.durationMs ?? undefined,
      errorCode: stage.errorCode ?? undefined,
      errorMessage: stage.errorMessage ?? undefined,
    }),
  );

  const designAnalysis = row.outputsDesignAnalysis
    ? parseJson(DesignAnalysisV1Schema, row.outputsDesignAnalysis, "design analysis")
    : null;
  const generationPlan = row.outputsGenerationPlan
    ? parseJson(GenerationPlanV1Schema, row.outputsGenerationPlan, "generation plan")
    : null;

  const activeVersion = row.versions.find((version) => version.versionId === row.activeVersionId);
  const generatedProject = activeVersion
    ? parseJson(GeneratedProjectV1Schema, activeVersion.projectSnapshot, "active project version")
    : null;

  return {
    id: row.id,
    imageId: row.sourceImageId,
    projectId: row.projectId,
    status: row.status as GenerationUserStatus,
    activeStage: (row.currentStage as GenerationRecord["activeStage"]) ?? null,
    stages: mappedStages,
    outputs: {
      designAnalysis,
      generationPlan,
      generatedProject,
    },
    analysis: row.analysisMetadata as GenerationRecord["analysis"],
    plan: row.planMetadata as GenerationRecord["plan"],
    project: row.projectMetadata as GenerationRecord["project"],
    schemaValidation: row.schemaValidation as GenerationRecord["schemaValidation"],
    staticValidation: row.staticValidation as GenerationRecord["staticValidation"],
    sandboxValidation: row.sandboxValidation as GenerationRecord["sandboxValidation"],
    projectHash: row.latestProjectHash,
    validationReportFingerprint: row.validationReportFingerprint,
    repairRequired: row.repairRequired,
    repairStatus: row.repairStatus as GenerationRecord["repairStatus"],
    currentRepairAttempt: row.currentRepairAttempt,
    maxRepairAttempts: row.maxRepairAttempts,
    repairAttempts: row.repairAttempts.map(mapRepair).map((attempt) => ({
      ...attempt,
      patchFingerprint: row.repairAttempts.find((entry) => entry.attemptNumber === attempt.attemptNumber)?.patchFingerprint ?? undefined,
      diagnosticsFingerprint:
        row.repairAttempts.find((entry) => entry.attemptNumber === attempt.attemptNumber)?.diagnosticsFingerprint ?? undefined,
    })),
    repairInProgress: row.repairInProgress,
    manualRetryAllowed: row.manualRetryAllowed,
    editedByUser: row.editedByUser,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    awaitingPlanConfirmation: row.awaitingPlanConfirmation,
    awaitingSandboxValidation: row.awaitingSandboxValidation,
    pipelineState: row.pipelineState as GenerationRecord["pipelineState"],
    resumeInProgress: row.resumeInProgress,
    sandboxResumeInProgress: row.sandboxResumeInProgress,
    errors: Array.isArray(row.errors) ? (row.errors as unknown as GenerationRecord["errors"]) : [],
    cancelled: row.cancelled,
    failStage: row.failStage as GenerationRecord["failStage"],
    exports: row.exports.map(mapExport),
    exportInProgress: row.exportInProgress,
    versions: row.versions.map(mapVersion),
    activeVersionId: row.activeVersionId,
    edits: row.edits.map(mapEdit),
    editInProgress: row.editInProgress,
    activeEditId: row.activeEditId,
    rollbackInProgress: row.rollbackInProgress,
    visualComparisons: row.visualComparisons.map(mapComparison),
    visualComparisonInProgress: row.visualComparisonInProgress,
    activeComparisonId: row.activeComparisonId,
    visualCorrectionInProgress: row.visualCorrectionInProgress,
    visualCorrectionAttempt: row.visualCorrectionAttempt,
    visualCorrectionMaxAttempts: row.visualCorrectionMaxAttempts,
    previewCaptureRequired: row.previewCaptureRequired,
    pendingVisualRecomparison: row.pendingVisualRecomparison as GenerationRecord["pendingVisualRecomparison"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stateVersion: row.stateVersion,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function mapRecordToGenerationData(record: GenerationRecord): Prisma.GenerationUncheckedUpdateInput {
  return {
    id: record.id,
    projectId: record.projectId,
    status: record.status,
    currentStage: record.activeStage,
    sourceImageId: record.imageId,
    activeVersionId: record.activeVersionId,
    latestProjectHash: record.projectHash,
    stateVersion: record.stateVersion ?? 1,
    cancelled: record.cancelled,
    failStage: record.failStage,
    failureCode: record.errors.at(-1)?.code,
    failureMessage: record.errors.at(-1)?.message,
    repairRequired: record.repairRequired,
    repairStatus: record.repairStatus,
    currentRepairAttempt: record.currentRepairAttempt,
    maxRepairAttempts: record.maxRepairAttempts,
    repairInProgress: record.repairInProgress,
    manualRetryAllowed: record.manualRetryAllowed,
    editedByUser: record.editedByUser,
    confirmedAt: record.confirmedAt ? new Date(record.confirmedAt) : null,
    awaitingPlanConfirmation: record.awaitingPlanConfirmation,
    awaitingSandboxValidation: record.awaitingSandboxValidation,
    validationReportFingerprint: record.validationReportFingerprint,
    exportInProgress: record.exportInProgress,
    editInProgress: record.editInProgress,
    activeEditId: record.activeEditId,
    rollbackInProgress: record.rollbackInProgress,
    visualComparisonInProgress: record.visualComparisonInProgress,
    activeComparisonId: record.activeComparisonId,
    visualCorrectionInProgress: record.visualCorrectionInProgress,
    visualCorrectionAttempt: record.visualCorrectionAttempt,
    visualCorrectionMaxAttempts: record.visualCorrectionMaxAttempts,
    previewCaptureRequired: record.previewCaptureRequired,
    resumeInProgress: record.resumeInProgress,
    sandboxResumeInProgress: record.sandboxResumeInProgress,
    pipelineState: record.pipelineState ? toInputJson(record.pipelineState) : undefined,
    pendingVisualRecomparison: record.pendingVisualRecomparison
      ? toInputJson(record.pendingVisualRecomparison)
      : undefined,
    schemaValidation: record.schemaValidation ? toInputJson(record.schemaValidation) : undefined,
    staticValidation: record.staticValidation ? toInputJson(record.staticValidation) : undefined,
    sandboxValidation: record.sandboxValidation ? toInputJson(record.sandboxValidation) : undefined,
    analysisMetadata: record.analysis ? toInputJson(record.analysis) : undefined,
    planMetadata: record.plan ? toInputJson(record.plan) : undefined,
    projectMetadata: record.project ? toInputJson(record.project) : undefined,
    outputsDesignAnalysis: record.outputs.designAnalysis ? toInputJson(record.outputs.designAnalysis) : undefined,
    outputsGenerationPlan: record.outputs.generationPlan ? toInputJson(record.outputs.generationPlan) : undefined,
    errors: toInputJson(record.errors),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
    updatedAt: new Date(record.updatedAt),
  };
}
