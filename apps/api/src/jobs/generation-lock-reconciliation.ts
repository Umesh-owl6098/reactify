import type { GenerationStore } from "../pipeline/store.js";
import type { GenerationRecord } from "../pipeline/types.js";
import { restoreGenerationReadyAfterEdit } from "./generation-sync.js";
import type { JobRepository } from "./job-repository.js";
import type { BackgroundJobType } from "./job-types.js";

const TERMINAL_EDIT_STATUSES = new Set(["completed", "failed", "cancelled"]);
const ACTIVE_EDIT_STATUSES = new Set([
  "analyzing",
  "generating_patch",
  "awaiting_confirmation",
  "awaiting_sandbox_validation",
  "clarification_required",
]);
const RUNNING_EDIT_STATUSES = new Set([
  "analyzing",
  "generating_patch",
  "validating_patch",
  "applying_patch",
  "awaiting_sandbox_validation",
]);
const PENDING_JOB_STATUSES = new Set(["queued", "claimed", "running", "retry_scheduled", "waiting_for_client"]);
const EDIT_JOB_TYPES: BackgroundJobType[] = ["edit_intent_analysis", "project_edit_generation"];
const EXPORT_JOB_TYPES: BackgroundJobType[] = ["export_preparation"];

export interface GenerationLockReconciliationConfig {
  editLockTimeoutMs: number;
  visualCaptureTimeoutMs: number;
  exportLockTimeoutMs?: number;
}

export function reconcileGenerationLocksSync(
  record: GenerationRecord,
  config: GenerationLockReconciliationConfig,
): boolean {
  let changed = false;

  if (
    record.editInProgress ||
    record.activeEditId !== null ||
    record.edits.some((edit) => ACTIVE_EDIT_STATUSES.has(edit.status))
  ) {
    changed = reconcileEditLock(record) || changed;
  }

  if (
    record.visualComparisonInProgress ||
    record.previewCaptureRequired ||
    record.visualComparisons.some((comparison) =>
      ["awaiting_capture", "processing"].includes(comparison.status),
    )
  ) {
    changed = reconcileVisualComparisonLock(record, config) || changed;
  }

  changed = reconcileExportLock(record, config) || changed;

  changed = reconcileStuckGenerationStatus(record) || changed;

  if (changed) {
    record.updatedAt = new Date().toISOString();
  }

  return changed;
}

export async function reconcileGenerationLocks(
  generationId: string,
  store: GenerationStore,
  repository: JobRepository,
  config: GenerationLockReconciliationConfig,
): Promise<boolean> {
  const record = store.get(generationId);
  if (!record) {
    return false;
  }

  let changed = reconcileGenerationLocksSync(record, config);

  if (
    record.editInProgress ||
    record.activeEditId !== null ||
    record.edits.some((edit) => ACTIVE_EDIT_STATUSES.has(edit.status))
  ) {
    changed = (await reconcileEditLockWithJobs(record, repository, config)) || changed;
  }

  if (record.exportInProgress) {
    changed = (await reconcileExportLockWithJobs(record, repository, config)) || changed;
  }

  if (changed) {
    record.updatedAt = new Date().toISOString();
    await store.persist(record);
  }

  return changed;
}

function reconcileEditLock(record: GenerationRecord): boolean {
  const activeEdit =
    (record.activeEditId ? record.edits.find((edit) => edit.editId === record.activeEditId) : undefined) ??
    record.edits.find((edit) => ACTIVE_EDIT_STATUSES.has(edit.status));

  if (!activeEdit || TERMINAL_EDIT_STATUSES.has(activeEdit.status)) {
    record.editInProgress = false;
    record.activeEditId = null;
    restoreReadyAfterStaleMutation(record);
    return true;
  }

  // An analyzing edit may be queued or running in another process. The
  // asynchronous reconciler below checks the job repository before declaring
  // it abandoned; elapsed wall time alone is not evidence that the lock is
  // stale.
  return false;
}

async function reconcileEditLockWithJobs(
  record: GenerationRecord,
  repository: JobRepository,
  config: GenerationLockReconciliationConfig,
): Promise<boolean> {
  const activeEdit =
    (record.activeEditId ? record.edits.find((edit) => edit.editId === record.activeEditId) : undefined) ??
    record.edits.find((edit) => ACTIVE_EDIT_STATUSES.has(edit.status));

  if (!activeEdit || TERMINAL_EDIT_STATUSES.has(activeEdit.status)) {
    record.editInProgress = false;
    record.activeEditId = null;
    restoreReadyAfterStaleMutation(record);
    return true;
  }

  const activeJobs = await Promise.all(
    EDIT_JOB_TYPES.map((jobType) => repository.findActiveJobByType(record.id, jobType)),
  );
  const hasRunningJob = activeJobs.some((job) => job && PENDING_JOB_STATUSES.has(job.status));
  if (hasRunningJob) {
    return false;
  }

  const updatedAt = activeEdit.updatedAt ?? activeEdit.createdAt;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  if (ageMs < config.editLockTimeoutMs) {
    return false;
  }

  if (!TERMINAL_EDIT_STATUSES.has(activeEdit.status)) {
    activeEdit.status = "failed";
    activeEdit.failureReason = "Edit job ended without completing and the lock was reconciled.";
    activeEdit.completedAt = new Date().toISOString();
  }

  record.editInProgress = false;
  record.activeEditId = null;
  restoreReadyAfterStaleMutation(record);
  return true;
}

function reconcileVisualComparisonLock(
  record: GenerationRecord,
  config: GenerationLockReconciliationConfig,
): boolean {
  let changed = false;
  const now = Date.now();

  // Reconcile every abandoned transient record, not only the one currently
  // referenced by the generation lock. A newer completed comparison can clear
  // that lock while an older awaiting_capture record remains in history.
  for (const comparison of record.visualComparisons) {
    if (!["awaiting_capture", "processing"].includes(comparison.status)) {
      continue;
    }
    const ageMs = now - new Date(comparison.createdAt).getTime();
    if (ageMs < config.visualCaptureTimeoutMs) {
      continue;
    }

    const previousStatus = comparison.status;
    comparison.status = "failed";
    comparison.failureReason =
      previousStatus === "processing"
        ? "Visual comparison processing timed out."
        : "Preview screenshot capture timed out. Open the preview and retry the comparison.";
    comparison.completedAt = new Date().toISOString();
    comparison.summary = comparison.failureReason;
    changed = true;
  }

  const activeComparison =
    (record.activeComparisonId
      ? record.visualComparisons.find((comparison) => comparison.comparisonId === record.activeComparisonId)
      : undefined) ??
    record.visualComparisons.find((comparison) =>
      ["awaiting_capture", "processing"].includes(comparison.status),
    );

  if (!activeComparison) {
    changed =
      record.visualComparisonInProgress ||
      record.previewCaptureRequired ||
      record.activeComparisonId !== null ||
      changed;
    record.visualComparisonInProgress = false;
    record.previewCaptureRequired = false;
    record.activeComparisonId = null;
    return changed;
  }

  if (["completed", "failed", "correction_available"].includes(activeComparison.status)) {
    changed =
      record.visualComparisonInProgress ||
      record.previewCaptureRequired ||
      record.activeComparisonId !== null ||
      changed;
    record.visualComparisonInProgress = false;
    record.previewCaptureRequired = false;
    record.activeComparisonId = null;
    return changed;
  }

  return changed;
}

function reconcileExportLock(record: GenerationRecord, config: GenerationLockReconciliationConfig): boolean {
  const exportTimeoutMs = config.exportLockTimeoutMs ?? config.editLockTimeoutMs;
  let changed = false;

  for (const entry of record.exports) {
    if (entry.status !== "preparing") {
      continue;
    }

    const superseded = record.exports.some(
      (candidate) =>
        candidate.exportId !== entry.exportId &&
        candidate.status === "ready" &&
        candidate.versionId === entry.versionId &&
        candidate.idempotencyFingerprint === entry.idempotencyFingerprint,
    );
    if (superseded) {
      entry.status = "failed";
      entry.failureReason = "Superseded by a completed export.";
      entry.completedAt = new Date().toISOString();
      changed = true;
      continue;
    }

    const ageMs = Date.now() - new Date(entry.createdAt).getTime();
    if (ageMs >= exportTimeoutMs) {
      entry.status = "failed";
      entry.failureReason = "Export preparation timed out and was reconciled.";
      entry.completedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (!record.exports.some((entry) => entry.status === "preparing") && record.exportInProgress) {
    record.exportInProgress = false;
    changed = true;
  }

  return changed;
}

async function reconcileExportLockWithJobs(
  record: GenerationRecord,
  repository: JobRepository,
  config: GenerationLockReconciliationConfig,
): Promise<boolean> {
  const preparing = record.exports.filter((entry) => entry.status === "preparing");
  if (preparing.length === 0) {
    if (record.exportInProgress) {
      record.exportInProgress = false;
      return true;
    }
    return false;
  }

  const activeJobs = await Promise.all(
    EXPORT_JOB_TYPES.map((jobType) => repository.findActiveJobByType(record.id, jobType)),
  );
  const hasRunningJob = activeJobs.some((job) => job && PENDING_JOB_STATUSES.has(job.status));
  if (hasRunningJob) {
    return false;
  }

  return reconcileExportLock(record, config);
}

function restoreReadyAfterStaleMutation(record: GenerationRecord): void {
  restoreGenerationReadyAfterEdit(record);
}

function reconcileStuckGenerationStatus(record: GenerationRecord): boolean {
  if (record.status !== "Generating" || !record.outputs.generatedProject || record.awaitingSandboxValidation) {
    return false;
  }

  if (record.editInProgress) {
    const activeEdit =
      (record.activeEditId ? record.edits.find((edit) => edit.editId === record.activeEditId) : undefined) ??
      record.edits.find((edit) => RUNNING_EDIT_STATUSES.has(edit.status));
    if (activeEdit && RUNNING_EDIT_STATUSES.has(activeEdit.status)) {
      return false;
    }
  }

  const previousStatus = record.status;
  restoreGenerationReadyAfterEdit(record);
  return record.status !== previousStatus;
}
