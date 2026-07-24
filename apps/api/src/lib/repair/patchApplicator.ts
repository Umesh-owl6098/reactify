import type { GeneratedProjectV1, ProjectPatchV1 } from "@reactify/generation-contracts";
import { GeneratedProjectV1Schema } from "@reactify/generation-contracts";
import { computeProjectHash } from "../projectHash.js";
import { normalizeProjectPath } from "../validation/filePathValidator.js";
import { validateRequiredProjectFiles } from "../validation/requiredFilesValidator.js";
import { runStaticProjectValidation } from "../validation/staticProjectValidator.js";

export interface PatchApplicationResult {
  project: GeneratedProjectV1;
  changedPaths: string[];
  deletedPaths: string[];
  dependencyDiff: ProjectPatchV1["dependencyChanges"];
  projectHash: string;
  staticValidation: ReturnType<typeof runStaticProjectValidation>;
}

export function applyProjectPatch(
  currentProject: GeneratedProjectV1,
  patch: ProjectPatchV1,
): { ok: true; result: PatchApplicationResult } | { ok: false; message: string } {
  const original = structuredClone(currentProject);
  const fileMap = new Map(
    original.files.map((file) => [normalizeProjectPath(file.path), { ...file }]),
  );

  const changedPaths: string[] = [];
  const deletedPaths: string[] = [];

  for (const changed of patch.changedFiles) {
    const normalizedPath = normalizeProjectPath(changed.path);
    const existing = fileMap.get(normalizedPath);
    fileMap.set(normalizedPath, {
      path: normalizedPath,
      language: changed.language,
      purpose: existing?.purpose ?? "Repaired file",
      content: changed.fullContent,
      componentMetadata: existing?.componentMetadata,
    });
    changedPaths.push(normalizedPath);
  }

  for (const deleted of patch.deletedFiles) {
    const normalizedPath = normalizeProjectPath(deleted.path);
    if (fileMap.delete(normalizedPath)) {
      deletedPaths.push(normalizedPath);
    }
  }

  const dependencies = { ...original.dependencies };
  const devDependencies = { ...(original.devDependencies ?? {}) };

  for (const change of patch.dependencyChanges) {
    const target = change.targetGroup === "dependencies" ? dependencies : devDependencies;
    if (change.action === "remove") {
      delete target[change.packageName];
    } else if (change.version) {
      target[change.packageName] = change.version;
    }
  }

  const nextProject: GeneratedProjectV1 = {
    ...original,
    dependencies,
    devDependencies,
    files: [...fileMap.values()].sort((left, right) => left.path.localeCompare(right.path)),
    warnings: [...original.warnings, patch.repairSummary],
  };

  const packageFile = nextProject.files.find((file) => file.path === "package.json");
  if (packageFile) {
    packageFile.content = JSON.stringify(
      {
        name: JSON.parse(packageFile.content).name ?? nextProject.projectName,
        private: true,
        type: "module",
        scripts: JSON.parse(packageFile.content).scripts ?? {},
        dependencies,
        devDependencies,
      },
      null,
      2,
    );
  }

  const schema = GeneratedProjectV1Schema.safeParse(nextProject);
  if (!schema.success) {
    return { ok: false, message: "Repaired project failed schema validation." };
  }

  const requiredIssues = validateRequiredProjectFiles(nextProject);
  if (requiredIssues.length > 0) {
    return { ok: false, message: requiredIssues[0]?.message ?? "Required project files missing after patch." };
  }

  const staticValidation = runStaticProjectValidation(nextProject);
  if (!staticValidation.valid) {
    return { ok: false, message: staticValidation.errors[0]?.message ?? "Static validation failed after patch." };
  }

  return {
    ok: true,
    result: {
      project: nextProject,
      changedPaths,
      deletedPaths,
      dependencyDiff: patch.dependencyChanges,
      projectHash: computeProjectHash(nextProject),
      staticValidation,
    },
  };
}
