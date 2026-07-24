import type { Diagnostic } from "@reactify/generation-contracts";
import type { RepairabilityClassification } from "@reactify/generation-contracts";
import type { StaticValidationResult } from "@reactify/generation-contracts";
import type { SandboxValidationSnapshot } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";

const REPAIRABLE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /syntax/i, reason: "Syntax error" },
  { pattern: /unexpected token/i, reason: "Syntax error" },
  { pattern: /missing import/i, reason: "Missing import" },
  { pattern: /cannot find module/i, reason: "Module resolution error" },
  { pattern: /module not found/i, reason: "Module resolution error" },
  { pattern: /typescript/i, reason: "TypeScript error" },
  { pattern: /type '.+' is not assignable/i, reason: "TypeScript error" },
  { pattern: /jsx/i, reason: "Invalid JSX" },
  { pattern: /export/i, reason: "Missing export" },
  { pattern: /render/i, reason: "React render error" },
  { pattern: /referenceerror/i, reason: "Reference error" },
  { pattern: /undefined variable/i, reason: "Undefined variable" },
  { pattern: /package\.json/i, reason: "Malformed package.json" },
  { pattern: /root/i, reason: "Root element mismatch" },
];

const NON_REPAIRABLE_PATTERNS: Array<{ pattern: RegExp; reason: string; code?: string }> = [
  { pattern: /unsafe dependency|not allowlisted|disallowed dependency/i, reason: "Disallowed dependency required", code: ErrorCode.UNSAFE_DEPENDENCY },
  { pattern: /project too large|patch too large|report too large/i, reason: "Project too large" },
  { pattern: /hash mismatch|integrity/i, reason: "Hash mismatch", code: ErrorCode.SANDBOX_REPORT_INVALID },
  { pattern: /missing generated project|missing source project/i, reason: "Missing source project" },
  { pattern: /provider configuration|anthropic_api_key/i, reason: "Provider configuration failure" },
  { pattern: /security violation|unsafe source|eval\(|Function\(/i, reason: "Security violation", code: ErrorCode.PATCH_SECURITY_VIOLATION },
];

export interface RepairabilityInput {
  diagnostics: Diagnostic[];
  staticValidation?: StaticValidationResult | null;
  attemptCount: number;
  maxAttempts: number;
  hasGeneratedProject: boolean;
  hashMismatch?: boolean;
  repeatedPatchDetected?: boolean;
  repeatedDiagnosticsDetected?: boolean;
}

export function collectRepairDiagnostics(input: {
  staticValidation?: StaticValidationResult | null;
  sandboxValidation?: SandboxValidationSnapshot | null;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (input.staticValidation) {
    for (const issue of [...input.staticValidation.errors, ...input.staticValidation.warnings]) {
      diagnostics.push({
        code: issue.code,
        message: issue.message,
        severity: issue.severity === "warning" ? "warning" : "error",
        source: "typescript",
        category: "static-validation",
        filePath: issue.filePath,
      });
    }
  }

  if (input.sandboxValidation) {
    for (const issue of [
      ...input.sandboxValidation.compilation.errors,
      ...input.sandboxValidation.compilation.warnings,
      ...input.sandboxValidation.runtime.errors,
      ...input.sandboxValidation.runtime.warnings,
    ]) {
      diagnostics.push(issue);
    }
  }

  return diagnostics;
}

export function classifyRepairability(input: RepairabilityInput): RepairabilityClassification {
  const reasons: string[] = [];

  if (!input.hasGeneratedProject) {
    return { repairable: false, reasons: ["Missing generated project"] };
  }

  if (input.hashMismatch) {
    return { repairable: false, reasons: ["Project hash mismatch"] };
  }

  if (input.repeatedPatchDetected) {
    return { repairable: false, reasons: ["Repeated identical patch detected"] };
  }

  if (input.repeatedDiagnosticsDetected) {
    return { repairable: false, reasons: ["Repeated identical diagnostics detected"] };
  }

  if (input.attemptCount >= input.maxAttempts) {
    return { repairable: false, reasons: ["Maximum repair attempts reached"] };
  }

  if (input.diagnostics.length === 0) {
    return { repairable: false, reasons: ["No diagnostics available for repair"] };
  }

  for (const diagnostic of input.diagnostics) {
    const haystack = `${diagnostic.code} ${diagnostic.message}`;
    for (const rule of NON_REPAIRABLE_PATTERNS) {
      if (rule.pattern.test(haystack)) {
        reasons.push(rule.reason);
      }
    }
  }

  if (reasons.length > 0) {
    return { repairable: false, reasons: [...new Set(reasons)] };
  }

  const repairableReasons: string[] = [];
  for (const diagnostic of input.diagnostics) {
    if (diagnostic.severity === "error") {
      const haystack = `${diagnostic.code} ${diagnostic.message}`;
      for (const rule of REPAIRABLE_PATTERNS) {
        if (rule.pattern.test(haystack)) {
          repairableReasons.push(rule.reason);
        }
      }
    }
  }

  if (repairableReasons.length > 0 || input.diagnostics.some((item) => item.severity === "error")) {
    return {
      repairable: true,
      reasons: repairableReasons.length > 0 ? [...new Set(repairableReasons)] : ["Repairable validation errors detected"],
    };
  }

  return { repairable: false, reasons: ["No repairable diagnostics found"] };
}

export function diagnosticsFingerprint(diagnostics: Diagnostic[]): string {
  return JSON.stringify(
    diagnostics
      .map((item) => ({
        code: item.code,
        message: item.message,
        filePath: item.filePath ?? "",
        severity: item.severity,
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  );
}

export function patchFingerprint(patch: import("@reactify/generation-contracts").ProjectPatchV1): string {
  return JSON.stringify({
    changedFiles: patch.changedFiles.map((file) => ({
      path: file.path,
      fullContent: file.fullContent,
    })),
    deletedFiles: patch.deletedFiles,
    dependencyChanges: patch.dependencyChanges,
  });
}
