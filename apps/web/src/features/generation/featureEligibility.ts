import type {
  EditBlockedReason,
  ExportBlockedReason,
  GenerationStatusResponse,
  VisualComparisonBlockedReason,
} from "@reactify/generation-contracts";
import type { PreviewReadiness } from "../preview/previewReadiness";

/**
 * Preview, export, compare, and edit each fail for their own reasons, and a
 * single "validation passed" flag hides that. Preview can be blank while an
 * export is perfectly downloadable, and an export lock says nothing about
 * whether the preview rendered. Each capability resolves its own reason so the
 * UI can tell the user which one is actually unavailable and why.
 */

const EXPORT_REASON_TEXT: Record<ExportBlockedReason, string> = {
  project_not_found: "No generated project is available to export.",
  active_version_not_found: "This generation has no active project version.",
  project_not_validated: "The project has not passed validation yet.",
  awaiting_plan_confirmation: "The generation plan still needs confirmation.",
  awaiting_sandbox_validation: "Sandbox validation has not finished.",
  repair_in_progress: "An automatic repair is running.",
  generation_cancelled: "This generation was cancelled.",
  generation_failed: "This generation failed.",
  repair_failed: "The last repair attempt failed.",
  export_in_progress: "An export is already being prepared.",
  edit_in_progress: "An edit is currently being applied.",
  project_integrity_failed: "The stored project failed its integrity check.",
  generation_in_progress: "The generation pipeline is still running.",
};

const EDIT_REASON_TEXT: Record<EditBlockedReason, string> = {
  generation_not_found: "This generation could not be found.",
  active_version_not_found: "This generation has no active project version.",
  project_integrity_failed: "The stored project failed its integrity check.",
  awaiting_plan_confirmation: "The generation plan still needs confirmation.",
  generation_in_progress: "The generation pipeline is still running.",
  generation_cancelled: "This generation was cancelled.",
  repair_in_progress: "An automatic repair is running.",
  rollback_in_progress: "A version rollback is in progress.",
  export_in_progress: "An export is being prepared.",
  edit_in_progress: "Another edit is already being applied.",
  project_not_validated: "The project has not passed validation yet.",
  edit_not_allowed: "Editing is not available for this generation.",
};

const COMPARE_REASON_TEXT: Record<VisualComparisonBlockedReason, string> = {
  generation_not_found: "This generation could not be found.",
  source_image_not_found: "The uploaded source screenshot is no longer available.",
  active_version_not_found: "This generation has no active project version.",
  preview_not_ready: "The preview has not rendered yet, so it cannot be captured.",
  awaiting_plan_confirmation: "The generation plan still needs confirmation.",
  awaiting_sandbox_validation: "Sandbox validation has not finished.",
  generation_in_progress: "The generation pipeline is still running.",
  generation_cancelled: "This generation was cancelled.",
  project_not_validated: "The project has not passed validation yet.",
  project_integrity_failed: "The stored project failed its integrity check.",
  visual_comparison_in_progress: "A comparison is already running.",
  visual_correction_in_progress: "A visual correction is being applied.",
  edit_in_progress: "An edit is currently being applied.",
  repair_in_progress: "An automatic repair is running.",
  rollback_in_progress: "A version rollback is in progress.",
  export_in_progress: "An export is being prepared.",
  comparison_not_allowed: "Comparison is not available for this generation.",
  correction_attempts_exhausted: "The bounded visual correction attempts have been used up.",
};

export interface FeatureEligibility {
  previewAvailable: boolean;
  previewUnavailableReason: string | null;
  exportAvailable: boolean;
  exportUnavailableReason: string | null;
  compareAvailable: boolean;
  compareUnavailableReason: string | null;
  editAvailable: boolean;
  editUnavailableReason: string | null;
}

function describe<Reason extends string>(
  allowed: boolean,
  reason: Reason | null,
  table: Record<Reason, string>,
  fallback: string,
): string | null {
  if (allowed) {
    return null;
  }
  if (reason && reason in table) {
    return table[reason];
  }
  return fallback;
}

export function resolveFeatureEligibility(
  status: GenerationStatusResponse,
  previewReadiness: PreviewReadiness,
): FeatureEligibility {
  return {
    previewAvailable: previewReadiness.ready,
    previewUnavailableReason: previewReadiness.ready ? null : previewReadiness.reason,
    exportAvailable: status.exportAllowed,
    exportUnavailableReason: describe(
      status.exportAllowed,
      status.exportBlockedReason,
      EXPORT_REASON_TEXT,
      "Export is not available right now.",
    ),
    compareAvailable: status.visualComparisonAllowed,
    compareUnavailableReason: describe(
      status.visualComparisonAllowed,
      status.visualComparisonBlockedReason,
      COMPARE_REASON_TEXT,
      "Comparison is not available right now.",
    ),
    editAvailable: status.editAllowed,
    editUnavailableReason: describe(
      status.editAllowed,
      status.editBlockedReason,
      EDIT_REASON_TEXT,
      "Editing is not available right now.",
    ),
  };
}
