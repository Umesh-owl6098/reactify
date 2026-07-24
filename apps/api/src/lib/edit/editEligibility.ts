import type { EditBlockedReason } from "@reactify/generation-contracts";
import { ErrorCode, type ErrorCode as ErrorCodeType } from "@reactify/shared";
import { computeProjectHash } from "../projectHash.js";
import { validateRequiredProjectFiles } from "../validation/requiredFilesValidator.js";
import type { GenerationRecord } from "../../pipeline/types.js";

export type EditEligibilityResult =
  | { ok: true }
  | { ok: false; reason: EditBlockedReason; errorCode: ErrorCodeType; message: string };

export function evaluateEditEligibility(record: GenerationRecord | undefined): EditEligibilityResult {
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
      message: "Cancelled generations cannot be edited.",
    };
  }

  if (record.visualComparisonInProgress || record.visualCorrectionInProgress) {
    return {
      ok: false,
      reason: "edit_in_progress",
      errorCode: ErrorCode.EDIT_IN_PROGRESS,
      message: "Edit is unavailable while visual comparison or correction is in progress.",
    };
  }

  if (record.editInProgress) {
    return {
      ok: false,
      reason: "edit_in_progress",
      errorCode: ErrorCode.EDIT_IN_PROGRESS,
      message: "An edit is already in progress for this generation.",
    };
  }

  const activeEdit = record.edits.find((edit) => edit.editId === record.activeEditId);
  if (
    activeEdit &&
    ["analyzing", "generating_patch", "validating_patch", "applying_patch", "awaiting_sandbox_validation"].includes(
      activeEdit.status,
    )
  ) {
    return {
      ok: false,
      reason: "edit_in_progress",
      errorCode: ErrorCode.EDIT_IN_PROGRESS,
      message: "An edit is already in progress for this generation.",
    };
  }

  if (record.repairInProgress) {
    return {
      ok: false,
      reason: "repair_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Edit is unavailable while repair is in progress.",
    };
  }

  if (record.rollbackInProgress) {
    return {
      ok: false,
      reason: "rollback_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Edit is unavailable while rollback is in progress.",
    };
  }

  if (record.exportInProgress) {
    return {
      ok: false,
      reason: "export_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Edit is unavailable while export is in progress.",
    };
  }

  if (record.awaitingPlanConfirmation) {
    return {
      ok: false,
      reason: "awaiting_plan_confirmation",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Edit is unavailable while awaiting plan confirmation.",
    };
  }

  const inProgressStatuses = new Set(["Queued", "Uploading", "Analyzing", "Planning", "Generating", "Validating"]);
  if (inProgressStatuses.has(record.status)) {
    return {
      ok: false,
      reason: "generation_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Edit is unavailable while generation is in progress.",
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

  if (!record.projectHash || !record.activeVersionId) {
    return {
      ok: false,
      reason: "active_version_not_found",
      errorCode: ErrorCode.ACTIVE_VERSION_NOT_FOUND,
      message: "Active project version was not found.",
    };
  }

  const allowedStatuses = new Set(["Ready", "RepairFailed", "Compiling", "Repairing", "RepairRequired"]);
  if (!allowedStatuses.has(record.status)) {
    return {
      ok: false,
      reason: "edit_not_allowed",
      errorCode: ErrorCode.EDIT_NOT_ALLOWED,
      message: "Edit is not allowed in the current generation state.",
    };
  }

  const schemaValid = record.schemaValidation?.valid === true;
  const staticValid = record.staticValidation?.valid === true;
  if (!schemaValid || !staticValid) {
    return {
      ok: false,
      reason: "project_not_validated",
      errorCode: ErrorCode.PROJECT_NOT_VALIDATED,
      message: "Project must pass schema and static validation before editing.",
    };
  }

  const computedHash = computeProjectHash(record.outputs.generatedProject);
  if (computedHash !== record.projectHash) {
    return {
      ok: false,
      reason: "project_integrity_failed",
      errorCode: ErrorCode.PROJECT_INTEGRITY_FAILED,
      message: "Project hash mismatch detected during integrity verification.",
    };
  }

  const requiredIssues = validateRequiredProjectFiles(record.outputs.generatedProject);
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

export function buildEditSnapshotFields(record: GenerationRecord): {
  editAllowed: boolean;
  editBlockedReason: EditBlockedReason | null;
  sandboxRevalidationRequired: boolean;
} {
  const eligibility = evaluateEditEligibility(record);
  return {
    editAllowed: eligibility.ok,
    editBlockedReason: eligibility.ok ? null : eligibility.reason,
    sandboxRevalidationRequired: record.awaitingSandboxValidation,
  };
}
