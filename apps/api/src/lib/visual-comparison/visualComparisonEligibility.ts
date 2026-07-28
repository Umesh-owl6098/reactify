import type { VisualComparisonBlockedReason } from "@reactify/generation-contracts";
import { ErrorCode, type ErrorCode as ErrorCodeType } from "@reactify/shared";
import { computeProjectHash } from "../projectHash.js";
import { validateRequiredProjectFiles } from "../validation/requiredFilesValidator.js";
import type { GenerationRecord } from "../../pipeline/types.js";
import { getValidActiveVersion } from "../edit/versionStore.js";

export type VisualComparisonEligibilityResult =
  | { ok: true }
  | { ok: false; reason: VisualComparisonBlockedReason; errorCode: ErrorCodeType; message: string };

function hasMutationInProgress(record: GenerationRecord): VisualComparisonEligibilityResult | null {
  if (record.visualComparisonInProgress) {
    return {
      ok: false,
      reason: "visual_comparison_in_progress",
      errorCode: ErrorCode.VISUAL_COMPARISON_IN_PROGRESS,
      message: "A visual comparison is already in progress for this generation.",
    };
  }

  if (record.visualCorrectionInProgress) {
    return {
      ok: false,
      reason: "visual_correction_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Visual correction is in progress for this generation.",
    };
  }

  if (record.editInProgress) {
    return {
      ok: false,
      reason: "edit_in_progress",
      errorCode: ErrorCode.EDIT_IN_PROGRESS,
      message: "Visual comparison is unavailable while an edit is in progress.",
    };
  }

  if (record.repairInProgress) {
    return {
      ok: false,
      reason: "repair_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Visual comparison is unavailable while repair is in progress.",
    };
  }

  if (record.rollbackInProgress) {
    return {
      ok: false,
      reason: "rollback_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Visual comparison is unavailable while rollback is in progress.",
    };
  }

  if (record.exportInProgress) {
    return {
      ok: false,
      reason: "export_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Visual comparison is unavailable while export is in progress.",
    };
  }

  return null;
}

export function evaluateVisualComparisonEligibility(
  record: GenerationRecord | undefined,
): VisualComparisonEligibilityResult {
  if (!record) {
    return {
      ok: false,
      reason: "generation_not_found",
      errorCode: ErrorCode.GENERATION_NOT_FOUND,
      message: "Generation not found.",
    };
  }

  if (record.cancelled || record.status === "Cancelled") {
    return {
      ok: false,
      reason: "generation_cancelled",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Cancelled generations cannot be compared visually.",
    };
  }

  const mutation = hasMutationInProgress(record);
  if (mutation) {
    return mutation;
  }

  if (!record.imageId) {
    return {
      ok: false,
      reason: "source_image_not_found",
      errorCode: ErrorCode.SOURCE_IMAGE_NOT_FOUND,
      message: "Uploaded source screenshot was not found.",
    };
  }

  if (record.awaitingPlanConfirmation) {
    return {
      ok: false,
      reason: "awaiting_plan_confirmation",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Visual comparison is unavailable while awaiting plan confirmation.",
    };
  }

  const inProgressStatuses = new Set(["Queued", "Uploading", "Analyzing", "Planning", "Generating", "Validating"]);
  if (inProgressStatuses.has(record.status)) {
    return {
      ok: false,
      reason: "generation_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Visual comparison is unavailable while generation is in progress.",
    };
  }

  if (!record.outputs.generatedProject) {
    return {
      ok: false,
      reason: "generation_not_found",
      errorCode: ErrorCode.GENERATION_NOT_FOUND,
      message: "Generated project was not found.",
    };
  }

  const activeVersion = getValidActiveVersion(record);
  if (!activeVersion) {
    return {
      ok: false,
      reason: "active_version_not_found",
      errorCode: ErrorCode.ACTIVE_VERSION_NOT_FOUND,
      message: "Active project version was not found.",
    };
  }

  if (record.status !== "Ready") {
    return {
      ok: false,
      reason: "preview_not_ready",
      errorCode: ErrorCode.PREVIEW_NOT_READY,
      message: "Visual comparison requires a preview-ready project.",
    };
  }

  const schemaValid = record.schemaValidation?.valid === true;
  const staticValid = record.staticValidation?.valid === true;
  if (!schemaValid || !staticValid) {
    return {
      ok: false,
      reason: "project_not_validated",
      errorCode: ErrorCode.PROJECT_NOT_VALIDATED,
      message: "Project must pass schema and static validation before visual comparison.",
    };
  }

  if (record.awaitingSandboxValidation) {
    return {
      ok: false,
      reason: "awaiting_sandbox_validation",
      errorCode: ErrorCode.PREVIEW_NOT_READY,
      message: "Open the live preview so Sandpack can finish compilation and runtime validation.",
    };
  }

  const sandboxValid =
    record.sandboxValidation?.compilation.success === true &&
    record.sandboxValidation?.runtime.success === true &&
    record.sandboxValidation.projectHash === activeVersion.projectHash;
  if (!sandboxValid) {
    return {
      ok: false,
      reason: "preview_not_ready",
      errorCode: ErrorCode.PREVIEW_NOT_READY,
      message: "Sandpack compilation and runtime validation must succeed before visual comparison.",
    };
  }

  const computedHash = computeProjectHash(activeVersion.project);
  if (computedHash !== activeVersion.projectHash) {
    return {
      ok: false,
      reason: "project_integrity_failed",
      errorCode: ErrorCode.PROJECT_INTEGRITY_FAILED,
      message: "Project hash mismatch detected during integrity verification.",
    };
  }

  const requiredIssues = validateRequiredProjectFiles(activeVersion.project);
  if (requiredIssues.length > 0) {
    return {
      ok: false,
      reason: "project_integrity_failed",
      errorCode: ErrorCode.PROJECT_INTEGRITY_FAILED,
      message: requiredIssues[0]?.message ?? "Required project files are missing.",
    };
  }

  return { ok: true };
}

export function buildVisualComparisonSnapshotFields(record: GenerationRecord): {
  visualComparisonAllowed: boolean;
  visualComparisonBlockedReason: VisualComparisonBlockedReason | null;
  activeComparisonId: string | null;
  activeComparisonStatus: import("@reactify/generation-contracts").VisualComparisonStatus | null;
  latestSimilarityScore: number | null;
  latestDifferencePercentage: number | null;
  visualCorrectionAvailable: boolean;
  visualCorrectionStatus: import("@reactify/generation-contracts").VisualComparisonStatus | null;
  visualCorrectionAttempt: number;
  visualCorrectionMaxAttempts: number;
  previewCaptureRequired: boolean;
} {
  const eligibility = evaluateVisualComparisonEligibility(record);
  const activeComparison = record.visualComparisons.find(
    (comparison) => comparison.comparisonId === record.activeComparisonId,
  );
  const latestCompleted = [...record.visualComparisons]
    .reverse()
    .find((comparison) =>
      ["completed", "correction_available", "awaiting_revalidation"].includes(comparison.status),
    );

  const correctionAvailable =
    Boolean(
      latestCompleted &&
        latestCompleted.correctionRecommended &&
        latestCompleted.status === "correction_available" &&
        record.visualCorrectionAttempt < record.visualCorrectionMaxAttempts,
    ) && !record.visualCorrectionInProgress;

  return {
    visualComparisonAllowed: eligibility.ok,
    visualComparisonBlockedReason: eligibility.ok ? null : eligibility.reason,
    activeComparisonId: record.activeComparisonId,
    activeComparisonStatus: activeComparison?.status ?? null,
    latestSimilarityScore: latestCompleted?.overallSimilarityScore ?? null,
    latestDifferencePercentage: latestCompleted?.pixelDifferencePercentage ?? null,
    visualCorrectionAvailable: correctionAvailable,
    visualCorrectionStatus: record.visualCorrectionInProgress ? "correcting" : activeComparison?.status ?? null,
    visualCorrectionAttempt: record.visualCorrectionAttempt,
    visualCorrectionMaxAttempts: record.visualCorrectionMaxAttempts,
    previewCaptureRequired:
      record.previewCaptureRequired ||
      activeComparison?.status === "awaiting_capture" ||
      activeComparison?.status === "awaiting_revalidation",
  };
}
