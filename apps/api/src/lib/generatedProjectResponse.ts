import type { GeneratedProjectSummary, GeneratedProjectV1 } from "@reactify/generation-contracts";

export function toGeneratedProjectSummary(project: GeneratedProjectV1): GeneratedProjectSummary {
  return {
    schemaVersion: project.schemaVersion,
    responseVersion: project.responseVersion,
    projectName: project.projectName,
    summary: project.summary,
    generationPlanRef: project.generationPlanRef,
    designAnalysisRef: project.designAnalysisRef,
    dependencies: project.dependencies,
    devDependencies: project.devDependencies,
    entryFile: project.entryFile,
    warnings: project.warnings,
    components: project.components,
    files: project.files.map((file) => ({
      path: file.path,
      language: file.language,
      purpose: file.purpose,
      sizeBytes: Buffer.byteLength(file.content, "utf8"),
    })),
  };
}

export function getGeneratedProjectFile(
  project: GeneratedProjectV1,
  requestedPath: string,
): GeneratedProjectV1["files"][number] | undefined {
  const normalized = requestedPath.replace(/\\/g, "/").replace(/^\.\//, "");
  return project.files.find((file) => file.path.replace(/\\/g, "/").replace(/^\.\//, "") === normalized);
}
