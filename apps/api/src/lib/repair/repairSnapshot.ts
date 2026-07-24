import type {
  RepairAttemptRecord,
  RepairStatus,
} from "@reactify/generation-contracts";
import type { RepairStatusSnapshot } from "@reactify/generation-contracts";
import type { GenerationRecord } from "../../pipeline/types.js";

export function buildRepairStatusSnapshot(record: GenerationRecord, maxAttempts: number): RepairStatusSnapshot | null {
  if (record.repairAttempts.length === 0 && !record.repairRequired) {
    return null;
  }

  const latestAttempt = record.repairAttempts.at(-1);
  const latestDiagnostics = latestAttempt?.diagnosticsBefore ?? [];

  return {
    repairRequired: record.repairRequired,
    repairStatus: record.repairStatus,
    currentAttempt: record.currentRepairAttempt,
    maxAttempts,
    manualRetryAllowed: record.manualRetryAllowed,
    clientRevalidationRequired: record.awaitingSandboxValidation,
    latestPatchSummary: latestAttempt?.patchSummary ?? null,
    changedFiles: latestAttempt?.changedFiles.map((file) => file.path) ?? [],
    deletedFiles: latestAttempt?.deletedFiles.map((file) => file.path) ?? [],
    dependencyChanges: latestAttempt?.dependencyChanges ?? [],
    unresolvedRisks: latestAttempt?.unresolvedRisks ?? [],
    latestDiagnostics,
    repairHistory: record.repairAttempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      patchSummary: attempt.patchSummary,
      changedFileCount: attempt.changedFiles.length,
      failureReason: attempt.failureReason,
      completedAt: attempt.completedAt,
    })),
  };
}

export function summarizeRepairAttempts(attempts: RepairAttemptRecord[]) {
  return attempts.map((attempt) => ({
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    patchSummary: attempt.patchSummary,
    changedFileCount: attempt.changedFiles.length,
    failureReason: attempt.failureReason,
    completedAt: attempt.completedAt,
  }));
}

export function isTransientRepairFailure(code?: string): boolean {
  return code === "AI_TIMEOUT" || code === "AI_ERROR";
}

export function nextRepairStatus(status: RepairStatus): RepairStatus {
  return status;
}
