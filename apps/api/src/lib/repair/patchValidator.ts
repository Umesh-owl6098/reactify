import type { ProjectPatchV1 } from "@reactify/generation-contracts";
import { ProjectPatchV1Schema } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { validateDependencyRecords } from "../validation/dependencyValidator.js";
import { validateProjectFilePath } from "../validation/filePathValidator.js";
import { scanSourceSafety } from "../validation/sourceSafetyScanner.js";

export interface PatchValidationLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
}

export interface PatchValidationFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.PATCH_SCHEMA_INVALID
    | typeof ErrorCode.PATCH_PATH_INVALID
    | typeof ErrorCode.PATCH_SECURITY_VIOLATION
    | typeof ErrorCode.PATCH_DEPENDENCY_INVALID
    | typeof ErrorCode.REPORT_TOO_LARGE;
  message: string;
}

export type PatchValidationResult = { ok: true; patch: ProjectPatchV1 } | PatchValidationFailure;

export function validateProjectPatch(
  patch: unknown,
  limits: PatchValidationLimits,
): PatchValidationResult {
  const parsed = ProjectPatchV1Schema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: ErrorCode.PATCH_SCHEMA_INVALID,
      message: "Project patch failed schema validation.",
    };
  }

  const value = parsed.data;
  if (value.changedFiles.length === 0 && value.deletedFiles.length === 0 && value.dependencyChanges.length === 0) {
    return {
      ok: false,
      errorCode: ErrorCode.PATCH_SCHEMA_INVALID,
      message: "Project patch makes no changes.",
    };
  }

  const changedPaths = new Set<string>();
  let totalBytes = 0;

  for (const file of value.changedFiles) {
    const pathResult = validateProjectFilePath(file.path);
    if (!pathResult.ok) {
      return {
        ok: false,
        errorCode: ErrorCode.PATCH_PATH_INVALID,
        message: pathResult.message,
      };
    }

    if (changedPaths.has(pathResult.normalizedPath)) {
      return {
        ok: false,
        errorCode: ErrorCode.PATCH_PATH_INVALID,
        message: `Duplicate changed path "${pathResult.normalizedPath}".`,
      };
    }
    changedPaths.add(pathResult.normalizedPath);

    const bytes = Buffer.byteLength(file.fullContent, "utf8");
    totalBytes += bytes;
    if (bytes > limits.maxFileBytes) {
      return {
        ok: false,
        errorCode: ErrorCode.REPORT_TOO_LARGE,
        message: `Patch file "${pathResult.normalizedPath}" exceeds size limit.`,
      };
    }

    const safety = scanSourceSafety(file.fullContent);
    if (!safety.ok) {
      return {
        ok: false,
        errorCode: ErrorCode.PATCH_SECURITY_VIOLATION,
        message: safety.message,
      };
    }
  }

  for (const deleted of value.deletedFiles) {
    const pathResult = validateProjectFilePath(deleted.path);
    if (!pathResult.ok) {
      return {
        ok: false,
        errorCode: ErrorCode.PATCH_PATH_INVALID,
        message: pathResult.message,
      };
    }

    if (changedPaths.has(pathResult.normalizedPath)) {
      return {
        ok: false,
        errorCode: ErrorCode.PATCH_PATH_INVALID,
        message: `Path "${pathResult.normalizedPath}" cannot be both changed and deleted.`,
      };
    }
  }

  const requiredPaths = new Set(["package.json", "index.html", "src/main.tsx", "src/App.tsx"]);
  for (const deleted of value.deletedFiles) {
    const pathResult = validateProjectFilePath(deleted.path);
    if (pathResult.ok && requiredPaths.has(pathResult.normalizedPath)) {
      return {
        ok: false,
        errorCode: ErrorCode.PATCH_PATH_INVALID,
        message: `Required file "${pathResult.normalizedPath}" cannot be deleted.`,
      };
    }
  }

  if (totalBytes > limits.maxTotalBytes) {
    return {
      ok: false,
      errorCode: ErrorCode.REPORT_TOO_LARGE,
      message: "Project patch exceeds total size limit.",
    };
  }

  const dependencyRecord: Record<string, string> = {};
  const devDependencyRecord: Record<string, string> = {};
  for (const change of value.dependencyChanges) {
    if (change.action === "remove") {
      continue;
    }
    if (!change.version) {
      return {
        ok: false,
        errorCode: ErrorCode.PATCH_DEPENDENCY_INVALID,
        message: `Dependency "${change.packageName}" requires a version for ${change.action}.`,
      };
    }
    if (change.targetGroup === "dependencies") {
      dependencyRecord[change.packageName] = change.version;
    } else {
      devDependencyRecord[change.packageName] = change.version;
    }
  }

  const dependencyValidation = validateDependencyRecords({
    dependencies: dependencyRecord,
    devDependencies: devDependencyRecord,
  });
  if (!dependencyValidation.ok) {
    const unsafe = dependencyValidation.issues.find((issue) => issue.code === "UNSAFE_DEPENDENCY");
    return {
      ok: false,
      errorCode: ErrorCode.PATCH_DEPENDENCY_INVALID,
      message: unsafe?.message ?? "Patch dependency validation failed.",
    };
  }

  return { ok: true, patch: value };
}
