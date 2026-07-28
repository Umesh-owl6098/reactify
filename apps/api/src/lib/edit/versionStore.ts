import { createHash, randomUUID } from "node:crypto";
import type { GeneratedProjectV1, ProjectVersionSource } from "@reactify/generation-contracts";
import { computeProjectHash } from "../projectHash.js";
import type { GenerationRecord, ProjectVersionRecord } from "../../pipeline/types.js";

export function getActiveVersion(record: GenerationRecord): ProjectVersionRecord | undefined {
  return record.versions.find((version) => version.versionId === record.activeVersionId);
}

/**
 * Resolve the active immutable snapshot only when every mutable project pointer
 * still describes that exact snapshot.
 */
export function getValidActiveVersion(record: GenerationRecord): ProjectVersionRecord | undefined {
  if (!record.activeVersionId || !record.projectHash || !record.outputs.generatedProject) {
    return undefined;
  }

  const version = getActiveVersion(record);
  if (!version) {
    return undefined;
  }

  const snapshotHash = computeProjectHash(version.project);
  const outputHash = computeProjectHash(record.outputs.generatedProject);
  if (
    snapshotHash !== version.projectHash ||
    version.projectHash !== record.projectHash ||
    outputHash !== version.projectHash
  ) {
    return undefined;
  }

  return version;
}

/**
 * The project the browser is allowed to fetch. Normally that is the validated
 * active version, but while the generation is awaiting sandbox validation the
 * browser must be able to load the pending project to compile it — the initial
 * version is created unactivated at that point, and refusing to serve it
 * deadlocks the pipeline (validation needs files; files need validation).
 * Content is only served when its hash matches the generation's project hash.
 */
export function getServableProject(record: GenerationRecord): GeneratedProjectV1 | undefined {
  const valid = getValidActiveVersion(record);
  if (valid) {
    return valid.project;
  }

  if (!record.awaitingSandboxValidation || !record.projectHash) {
    return undefined;
  }

  const pending = record.versions.find((version) => version.projectHash === record.projectHash);
  if (pending && computeProjectHash(pending.project) === record.projectHash) {
    return pending.project;
  }

  if (
    record.outputs.generatedProject &&
    computeProjectHash(record.outputs.generatedProject) === record.projectHash
  ) {
    return record.outputs.generatedProject;
  }

  return undefined;
}

export function canAssignReady(record: GenerationRecord): boolean {
  const activeVersion = getValidActiveVersion(record);
  return Boolean(
    activeVersion &&
      record.schemaValidation?.valid === true &&
      record.staticValidation?.valid === true &&
      record.sandboxValidation?.compilation.success === true &&
      record.sandboxValidation.runtime.success === true &&
      record.sandboxValidation.projectHash === activeVersion.projectHash &&
      !record.awaitingSandboxValidation,
  );
}

export function createProjectVersion(input: {
  record: GenerationRecord;
  project: GeneratedProjectV1;
  source: ProjectVersionSource;
  label: string;
  parentVersionId: string | null;
  changedFiles?: string[];
  editId?: string;
  instruction?: string;
  activate?: boolean;
}): ProjectVersionRecord {
  const versionNumber = input.record.versions.length + 1;
  const projectHash = computeProjectHash(input.project);
  const version: ProjectVersionRecord = {
    // The initial version historically used its content hash as its identifier,
    // but later versions need their own immutable identity. Re-applying content
    // after a rollback can legitimately produce a hash seen before; using that
    // hash as the primary key creates duplicate version IDs and prevents the
    // edit from being persisted.
    versionId: input.source === "initial_generation" ? projectHash : randomUUID(),
    versionNumber,
    source: input.source,
    label: input.label,
    parentVersionId: input.parentVersionId,
    projectHash,
    project: structuredClone(input.project),
    changedFiles: input.changedFiles ?? [],
    editId: input.editId,
    instruction: input.instruction,
    createdAt: new Date().toISOString(),
  };

  input.record.versions.push(version);
  if (input.activate !== false) {
    input.record.activeVersionId = version.versionId;
  }
  return version;
}

export function ensureInitialVersion(
  record: GenerationRecord,
  options: { activate?: boolean } = {},
): ProjectVersionRecord | undefined {
  const existing =
    getActiveVersion(record) ??
    record.versions.find((version) => version.source === "initial_generation");
  if (existing) {
    if (options.activate !== false && record.activeVersionId !== existing.versionId) {
      activateVersion(record, existing.versionId);
    }
    return existing;
  }

  if (!record.outputs.generatedProject || !record.projectHash) {
    return undefined;
  }

  return createProjectVersion({
    record,
    project: record.outputs.generatedProject,
    source: "initial_generation",
    label: "Initial generated project",
    parentVersionId: null,
    activate: options.activate,
  });
}

export function activateVersion(record: GenerationRecord, versionId: string): ProjectVersionRecord | undefined {
  const version = record.versions.find((entry) => entry.versionId === versionId);
  if (!version) {
    return undefined;
  }

  record.activeVersionId = version.versionId;
  record.outputs.generatedProject = structuredClone(version.project);
  record.projectHash = version.projectHash;
  return version;
}

export function computeIdempotencyFingerprint(input: {
  generationId: string;
  versionId: string;
  instruction: string;
  selectedFiles?: string[];
  selectedComponentIds?: string[];
  idempotencyKey?: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        generationId: input.generationId,
        versionId: input.versionId,
        instruction: input.instruction,
        selectedFiles: input.selectedFiles ?? [],
        selectedComponentIds: input.selectedComponentIds ?? [],
        idempotencyKey: input.idempotencyKey ?? "",
      }),
    )
    .digest("hex");
}

export function createEditId(): string {
  return randomUUID();
}
