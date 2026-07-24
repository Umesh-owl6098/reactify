import type { ValidationIssue } from "@reactify/generation-contracts";
import { ALLOWED_DEPENDENCIES } from "../allowlist.js";

const SEMVER_RE = /^[\^~]?\d+\.\d+\.\d+(-[\w.]+)?$/;

export interface DependencyRecordValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function createIssue(code: string, message: string, severity: "error" | "warning"): ValidationIssue {
  return { code, message, severity };
}

export function validateDependencyRecords(input: {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
}): DependencyRecordValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  const validateGroup = (group: Record<string, string>, label: string) => {
    for (const [name, version] of Object.entries(group)) {
      if (seen.has(name)) {
        issues.push(
          createIssue(
            "DUPLICATE_DEPENDENCY",
            `Dependency "${name}" appears in both dependencies and devDependencies.`,
            "error",
          ),
        );
      }
      seen.add(name);

      if (!ALLOWED_DEPENDENCIES.has(name)) {
        issues.push(
          createIssue("UNSAFE_DEPENDENCY", `Dependency "${name}" is not allowlisted.`, "error"),
        );
      }

      if (!SEMVER_RE.test(version)) {
        issues.push(
          createIssue(
            "INVALID_DEPENDENCY_VERSION",
            `${label} dependency "${name}" uses disallowed version "${version}".`,
            "error",
          ),
        );
      }

      if (/^(git\+|http:|https:|file:|latest|\*|x\.x\.x)/i.test(version)) {
        issues.push(
          createIssue(
            "INVALID_DEPENDENCY_SOURCE",
            `${label} dependency "${name}" must use an approved semver range.`,
            "error",
          ),
        );
      }
    }
  };

  validateGroup(input.dependencies, "Runtime");
  if (input.devDependencies) {
    validateGroup(input.devDependencies, "Dev");
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}

export function validatePackageJsonMatchesProject(input: {
  packageJsonContent: string;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    parsed = JSON.parse(input.packageJsonContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } catch {
    return [createIssue("INVALID_PACKAGE_JSON", "package.json is not valid JSON.", "error")];
  }

  for (const [name, version] of Object.entries(input.dependencies)) {
    if (parsed.dependencies?.[name] !== version) {
      issues.push(
        createIssue(
          "PACKAGE_JSON_MISMATCH",
          `package.json dependencies.${name} does not match GeneratedProjectV1.`,
          "error",
        ),
      );
    }
  }

  for (const [name, version] of Object.entries(input.devDependencies ?? {})) {
    if (parsed.devDependencies?.[name] !== version) {
      issues.push(
        createIssue(
          "PACKAGE_JSON_MISMATCH",
          `package.json devDependencies.${name} does not match GeneratedProjectV1.`,
          "error",
        ),
      );
    }
  }

  return issues;
}
