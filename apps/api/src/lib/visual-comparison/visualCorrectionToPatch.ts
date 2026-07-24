import type { ProjectPatchV1, VisualCorrectionV1 } from "@reactify/generation-contracts";

export function visualCorrectionToPatch(correction: VisualCorrectionV1): ProjectPatchV1 {
  return {
    schemaVersion: "1",
    responseVersion: correction.responseVersion,
    repairSummary: correction.correctionSummary,
    changedFiles: correction.changedFiles.map((file) => ({
      path: file.path,
      fullContent: file.fullContent,
      language: file.language,
      reason: file.reason,
    })),
    deletedFiles: correction.deletedFiles.map((path) => ({
      path,
      reason: "Removed by visual correction.",
    })),
    dependencyChanges: correction.dependencyChanges,
    expectedResolvedDiagnostics: [],
    unresolvedRisks: correction.unresolvedVisualRisks,
  };
}
