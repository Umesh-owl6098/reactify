import { GeneratedProjectV1Schema, type GeneratedProjectV1 } from "@reactify/generation-contracts";
import type { GenerationRecord, PipelineState } from "../../pipeline/types.js";
import { evaluateExportEligibility } from "../export/exportEligibility.js";
import { activateVersion, createProjectVersion, getActiveVersion } from "../edit/versionStore.js";
import { computeProjectHash } from "../projectHash.js";
import { logEvent } from "../structured-log.js";

function resolveProjectForHash(record: GenerationRecord, expectedHash: string): GeneratedProjectV1 | null {
  const pipelineState = record.pipelineState as PipelineState | null;
  const pipelineProject = pipelineState?.generatedProject
    ? GeneratedProjectV1Schema.safeParse(pipelineState.generatedProject)
    : null;
  if (pipelineProject?.success && computeProjectHash(pipelineProject.data) === expectedHash) {
    return pipelineProject.data;
  }

  const activeVersion = getActiveVersion(record);
  if (activeVersion && activeVersion.projectHash === expectedHash) {
    return activeVersion.project;
  }

  const versionMatch = record.versions.find((version) => version.projectHash === expectedHash);
  if (versionMatch) {
    return versionMatch.project;
  }

  if (record.outputs.generatedProject && computeProjectHash(record.outputs.generatedProject) === expectedHash) {
    return record.outputs.generatedProject;
  }

  return null;
}

function markLatestRepairAttemptSucceeded(record: GenerationRecord): void {
  const latestAttempt = record.repairAttempts.at(-1);
  if (!latestAttempt) {
    return;
  }

  if (latestAttempt.status === "waiting_for_revalidation") {
    latestAttempt.status = "succeeded";
    latestAttempt.completedAt = new Date().toISOString();
    latestAttempt.sandboxValidationAfter = record.sandboxValidation ?? undefined;
    latestAttempt.failureReason = undefined;
  }
}

export function shouldFinalizeRepairVersion(record: GenerationRecord, validatedProjectHash: string): boolean {
  if (!record.sandboxValidation?.compilation.success || !record.sandboxValidation.runtime.success) {
    return false;
  }

  if (record.sandboxValidation.projectHash !== validatedProjectHash) {
    return false;
  }

  const latestAttempt = record.repairAttempts.at(-1);
  return (
    record.currentRepairAttempt > 0 ||
    latestAttempt?.status === "waiting_for_revalidation"
  );
}

export function finalizeValidatedRepairVersion(record: GenerationRecord, validatedProjectHash: string): boolean {
  const activeVersion = getActiveVersion(record);
  if (
    activeVersion?.projectHash === validatedProjectHash &&
    record.outputs.generatedProject &&
    computeProjectHash(record.outputs.generatedProject) === validatedProjectHash
  ) {
    markLatestRepairAttemptSucceeded(record);
    return false;
  }

  if (!shouldFinalizeRepairVersion(record, validatedProjectHash)) {
    return false;
  }

  const project = resolveProjectForHash(record, validatedProjectHash);
  if (!project) {
    logEvent("repair_version_finalize_missing_project", {
      generationId: record.id,
      validatedProjectHash,
      activeVersionId: record.activeVersionId,
    });
    return false;
  }

  const computedHash = computeProjectHash(project);
  if (computedHash !== validatedProjectHash) {
    logEvent("repair_version_finalize_hash_mismatch", {
      generationId: record.id,
      validatedProjectHash,
      computedHash,
    });
    return false;
  }

  const existingVersion = record.versions.find(
    (version) =>
      version.projectHash === validatedProjectHash &&
      computeProjectHash(version.project) === validatedProjectHash,
  );
  const latestAttempt = record.repairAttempts.at(-1);

  record.outputs.generatedProject = structuredClone(project);
  record.projectHash = validatedProjectHash;

  if (existingVersion) {
    // Version snapshots are append-only. Reuse an identical immutable
    // snapshot, but never rewrite a row that may already be referenced by an
    // edit, comparison, or export.
    activateVersion(record, existingVersion.versionId);
  } else {
    createProjectVersion({
      record,
      project,
      source: "automatic_repair",
      label: latestAttempt ? `Repair attempt ${latestAttempt.attemptNumber}` : "Automatic repair",
      parentVersionId: record.activeVersionId,
      changedFiles: latestAttempt?.changedFiles.map((file) => file.path) ?? [],
    });
  }

  markLatestRepairAttemptSucceeded(record);

  logEvent("repair_version_finalized", {
    generationId: record.id,
    activeVersionId: record.activeVersionId,
    projectHash: validatedProjectHash,
    versionNumber: getActiveVersion(record)?.versionNumber,
  });

  return true;
}

export function recoverStaleRepairVersionIntegrity(record: GenerationRecord): boolean {
  if (record.status !== "Ready") {
    return false;
  }

  const validatedHash = record.sandboxValidation?.projectHash;
  if (!validatedHash) {
    return false;
  }

  const eligibility = evaluateExportEligibility(record);
  if (eligibility.ok) {
    if (record.repairAttempts.some((attempt) => attempt.status === "waiting_for_revalidation")) {
      markLatestRepairAttemptSucceeded(record);
      return true;
    }
    return false;
  }

  if (eligibility.reason !== "project_integrity_failed" && eligibility.reason !== "active_version_not_found") {
    return false;
  }

  const recovered = finalizeValidatedRepairVersion(record, validatedHash);
  if (recovered) {
    logEvent("repair_version_integrity_recovered", {
      generationId: record.id,
      activeVersionId: record.activeVersionId,
      projectHash: validatedHash,
    });
  }

  return recovered;
}
