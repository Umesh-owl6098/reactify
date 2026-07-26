import type { ExportBlockedReason } from "@reactify/generation-contracts";
import { ErrorCode, type ErrorCode as ErrorCodeType } from "@reactify/shared";
import { getActiveVersion } from "../edit/versionStore.js";
import { computeProjectHash } from "../projectHash.js";
import { validateRequiredProjectFiles } from "../validation/requiredFilesValidator.js";
import type { GenerationRecord } from "../../pipeline/types.js";

export interface ActiveProjectVersion {
  versionId: string;
  versionNumber: number;
  projectHash: string;
}

export type ExportEligibilityResult =
  | { ok: true; version: ActiveProjectVersion }
  | { ok: false; reason: ExportBlockedReason; errorCode: ErrorCodeType; message: string };

export function getActiveProjectVersion(record: GenerationRecord): ActiveProjectVersion | null {
  if (!record.projectHash) {
    return null;
  }

  const activeVersion = record.versions.find((version) => version.versionId === record.activeVersionId);
  return {
    versionId: record.activeVersionId ?? record.projectHash,
    versionNumber: activeVersion?.versionNumber ?? resolveVersionNumber(record),
    projectHash: activeVersion?.projectHash ?? record.projectHash,
  };
}

export function resolveVersionNumber(record: GenerationRecord): number {
  const succeededRepairs = record.repairAttempts.filter((attempt) => attempt.status === "succeeded").length;
  return Math.max(1, succeededRepairs + 1);
}

export function evaluateExportEligibility(
  record: GenerationRecord | undefined,
  options?: { activeExportId?: string },
): ExportEligibilityResult {
  if (!record) {
    return {
      ok: false,
      reason: "project_not_found",
      errorCode: ErrorCode.GENERATION_NOT_FOUND,
      message: "Generation not found.",
    };
  }

  if (record.cancelled || record.status === "Cancelled") {
    return {
      ok: false,
      reason: "generation_cancelled",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Cancelled generations cannot be exported.",
    };
  }

  if (record.exportInProgress) {
    const preparingExport = record.exports.find((entry) => entry.status === "preparing");
    const activeExportMatches =
      options?.activeExportId &&
      preparingExport?.exportId === options.activeExportId;
    if (preparingExport && !activeExportMatches) {
      return {
        ok: false,
        reason: "export_in_progress",
        errorCode: ErrorCode.EXPORT_IN_PROGRESS,
        message: "An export is already in progress for this generation.",
      };
    }

    if (!preparingExport) {
      record.exportInProgress = false;
    }
  }

  if (record.editInProgress) {
    return {
      ok: false,
      reason: "edit_in_progress",
      errorCode: ErrorCode.EXPORT_IN_PROGRESS,
      message: "Export is unavailable while an edit is in progress.",
    };
  }

  if (record.visualComparisonInProgress || record.visualCorrectionInProgress) {
    return {
      ok: false,
      reason: "edit_in_progress",
      errorCode: ErrorCode.EXPORT_IN_PROGRESS,
      message: "Export is unavailable while visual comparison or correction is in progress.",
    };
  }

  if (record.rollbackInProgress) {
    return {
      ok: false,
      reason: "project_not_validated",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Export is unavailable while rollback is in progress.",
    };
  }

  if (record.repairInProgress) {
    return {
      ok: false,
      reason: "repair_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Export is unavailable while repair is in progress.",
    };
  }

  if (record.awaitingPlanConfirmation) {
    return {
      ok: false,
      reason: "awaiting_plan_confirmation",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Export is unavailable while awaiting plan confirmation.",
    };
  }

  if (record.awaitingSandboxValidation) {
    return {
      ok: false,
      reason: "awaiting_sandbox_validation",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Export is unavailable while awaiting sandbox validation.",
    };
  }

  if (record.status === "RepairFailed") {
    return {
      ok: false,
      reason: "repair_failed",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Repair failed generations cannot be exported.",
    };
  }

  if (record.status === "Failed") {
    return {
      ok: false,
      reason: "generation_failed",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Failed generations cannot be exported.",
    };
  }

  if (record.status !== "Ready") {
    return {
      ok: false,
      reason: "generation_in_progress",
      errorCode: ErrorCode.INVALID_GENERATION_STATE,
      message: "Export is only available after preview validation succeeds.",
    };
  }

  if (!record.outputs.generatedProject) {
    return {
      ok: false,
      reason: "project_not_found",
      errorCode: ErrorCode.PROJECT_NOT_FOUND,
      message: "Generated project was not found.",
    };
  }

  if (!record.projectHash) {
    return {
      ok: false,
      reason: "active_version_not_found",
      errorCode: ErrorCode.ACTIVE_VERSION_NOT_FOUND,
      message: "Active project version was not found.",
    };
  }

  if (record.versions.length > 0 && !record.activeVersionId) {
    return {
      ok: false,
      reason: "active_version_not_found",
      errorCode: ErrorCode.ACTIVE_VERSION_NOT_FOUND,
      message: "Active project version was not found.",
    };
  }

  const version = getActiveProjectVersion(record);
  if (!version) {
    return {
      ok: false,
      reason: "active_version_not_found",
      errorCode: ErrorCode.ACTIVE_VERSION_NOT_FOUND,
      message: "Active project version was not found.",
    };
  }

  const activeVersionRecord = getActiveVersion(record);
  const project = activeVersionRecord?.project ?? record.outputs.generatedProject;

  const schemaValid = record.schemaValidation?.valid === true;
  const staticValid = record.staticValidation?.valid === true;
  const compilationValid = record.sandboxValidation?.compilation.success === true;
  const runtimeValid = record.sandboxValidation?.runtime.success === true;

  if (!schemaValid || !staticValid || !compilationValid || !runtimeValid) {
    return {
      ok: false,
      reason: "project_not_validated",
      errorCode: ErrorCode.PROJECT_NOT_VALIDATED,
      message: "Project must pass schema, static, compilation, and runtime validation before export.",
    };
  }

  const computedHash = computeProjectHash(project);
  if (computedHash !== version.projectHash || computedHash !== record.projectHash) {
    return {
      ok: false,
      reason: "project_integrity_failed",
      errorCode: ErrorCode.PROJECT_INTEGRITY_FAILED,
      message: "Project hash mismatch detected during integrity verification.",
    };
  }

  const requiredIssues = validateRequiredProjectFiles(project);
  if (requiredIssues.length > 0) {
    return {
      ok: false,
      reason: "project_integrity_failed",
      errorCode: ErrorCode.PROJECT_INTEGRITY_FAILED,
      message: requiredIssues[0]?.message ?? "Required project files are missing.",
    };
  }

  return { ok: true, version };
}

export function buildExportSnapshotFields(record: GenerationRecord): {
  exportAllowed: boolean;
  exportBlockedReason: ExportBlockedReason | null;
} {
  const eligibility = evaluateExportEligibility(record);
  return {
    exportAllowed: eligibility.ok,
    exportBlockedReason: eligibility.ok ? null : eligibility.reason,
  };
}
