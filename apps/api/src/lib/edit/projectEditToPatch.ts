import type { ProjectEditV1, ProjectPatchV1 } from "@reactify/generation-contracts";

export function projectEditToPatch(edit: ProjectEditV1): ProjectPatchV1 {
  return {
    schemaVersion: "1",
    responseVersion: edit.responseVersion,
    repairSummary: edit.editSummary,
    changedFiles: edit.changedFiles.map((file) => ({
      path: file.path,
      fullContent: file.fullContent,
      language: file.language,
      reason: file.reason,
    })),
    deletedFiles: edit.deletedFiles.map((path) => ({ path, reason: "Removed by natural-language edit." })),
    dependencyChanges: edit.dependencyChanges,
    expectedResolvedDiagnostics: [],
    unresolvedRisks: edit.unresolvedRisks,
  };
}
