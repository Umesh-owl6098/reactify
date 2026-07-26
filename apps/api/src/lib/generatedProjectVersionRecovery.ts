import { GeneratedProjectV1Schema } from "@reactify/generation-contracts";
import { ensureInitialVersion } from "./edit/versionStore.js";
import { logEvent } from "./structured-log.js";
import type { GenerationRecord, PipelineState } from "../pipeline/types.js";

export function recoverMissingInitialVersion(record: GenerationRecord): boolean {
  if (record.activeVersionId || record.versions.length > 0) {
    return false;
  }

  if (record.status !== "Compiling" || !record.awaitingSandboxValidation) {
    return false;
  }

  const pipelineState = record.pipelineState as PipelineState | null;
  if (!pipelineState?.generatedProject) {
    return false;
  }

  const parsedProject = GeneratedProjectV1Schema.safeParse(pipelineState.generatedProject);
  if (!parsedProject.success) {
    return false;
  }

  record.outputs.generatedProject = parsedProject.data;
  if (!record.projectHash) {
    record.projectHash = pipelineState.projectHash ?? record.projectHash;
  }

  ensureInitialVersion(record);

  if (!record.activeVersionId) {
    return false;
  }

  logEvent("recovered_missing_initial_version", {
    generationId: record.id,
    activeVersionId: record.activeVersionId,
    projectHash: record.projectHash,
  });

  return true;
}
