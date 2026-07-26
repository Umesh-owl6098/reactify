import { createHash, randomUUID } from "node:crypto";
import type { GeneratedProjectV1, ProjectVersionSource } from "@reactify/generation-contracts";
import { computeProjectHash } from "../projectHash.js";
import type { GenerationRecord, ProjectVersionRecord } from "../../pipeline/types.js";

export function getActiveVersion(record: GenerationRecord): ProjectVersionRecord | undefined {
  return record.versions.find((version) => version.versionId === record.activeVersionId);
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
  input.record.activeVersionId = version.versionId;
  return version;
}

export function ensureInitialVersion(record: GenerationRecord): ProjectVersionRecord | undefined {
  if (record.versions.length > 0 || !record.outputs.generatedProject || !record.projectHash) {
    return getActiveVersion(record);
  }

  return createProjectVersion({
    record,
    project: record.outputs.generatedProject,
    source: "initial_generation",
    label: "Initial generated project",
    parentVersionId: null,
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
