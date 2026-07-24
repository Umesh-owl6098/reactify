import type { Diagnostic, SandboxValidationRequest } from "@reactify/generation-contracts";
import { submitSandboxValidation } from "../../lib/generation-api";
import {
  dedupeDiagnostics,
  normalizeReactRenderError,
  normalizeRuntimeConsoleEvent,
  normalizeSandpackProblem,
  type RuntimeConsoleEvent,
  type SandpackProblem,
} from "./sandpackDiagnostics";

export const RUNTIME_VALIDATION_TIMEOUT_MS = 5000;
export const COMPILATION_TIMEOUT_MS = 30000;

export interface RuntimeValidationResult {
  success: boolean;
  durationMs: number;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export interface CompilationValidationResult {
  success: boolean;
  durationMs: number;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export function buildSandboxValidationRequest(input: {
  generationId: string;
  projectHash: string;
  compilation: CompilationValidationResult;
  runtime: RuntimeValidationResult;
}): SandboxValidationRequest {
  return {
    generationId: input.generationId,
    projectHash: input.projectHash,
    compilation: input.compilation,
    runtime: input.runtime,
    validatedAt: new Date().toISOString(),
  };
}

export function normalizeCompilationProblems(problems: SandpackProblem[]): CompilationValidationResult {
  const startedAt = Date.now();
  const normalized = problems.map(normalizeSandpackProblem);
  const errors = dedupeDiagnostics(normalized.filter((item) => item.severity === "error"));
  const warnings = dedupeDiagnostics(normalized.filter((item) => item.severity !== "error"));

  return {
    success: errors.length === 0,
    durationMs: Date.now() - startedAt,
    errors,
    warnings,
  };
}

export async function performRuntimeValidation(input: {
  waitForIdle: () => Promise<boolean>;
  readConsoleEvents: () => RuntimeConsoleEvent[];
  hasVisibleOutput: () => boolean;
  timeoutMs?: number;
}): Promise<RuntimeValidationResult> {
  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? RUNTIME_VALIDATION_TIMEOUT_MS;
  const deadline = startedAt + timeoutMs;
  let reloadCount = 0;
  let lastFatalSignature = "";
  let repeatedFatalCount = 0;

  while (Date.now() < deadline) {
    const ready = await input.waitForIdle();
    if (!ready) {
      reloadCount += 1;
      if (reloadCount > 2) {
        return {
          success: false,
          durationMs: Date.now() - startedAt,
          errors: [
            normalizeReactRenderError("Preview entered a repeated reload loop during runtime validation."),
          ],
          warnings: [],
        };
      }
    }

    const events = input.readConsoleEvents();
    const normalized = dedupeDiagnostics(
      events
        .map(normalizeRuntimeConsoleEvent)
        .filter((item): item is Diagnostic => item !== null),
    );

    const fatalErrors = normalized.filter(
      (item) => item.severity === "error" && item.category !== "runtime-warning",
    );
    const warnings = normalized.filter((item) => item.severity !== "error");

    if (fatalErrors.length > 0) {
      const signature = fatalErrors.map((item) => item.message).join("|");
      if (signature === lastFatalSignature) {
        repeatedFatalCount += 1;
      } else {
        lastFatalSignature = signature;
        repeatedFatalCount = 1;
      }

      if (repeatedFatalCount > 2) {
        return {
          success: false,
          durationMs: Date.now() - startedAt,
          errors: fatalErrors,
          warnings,
        };
      }

      return {
        success: false,
        durationMs: Date.now() - startedAt,
        errors: fatalErrors,
        warnings,
      };
    }

    if (ready && input.hasVisibleOutput()) {
      return {
        success: true,
        durationMs: Date.now() - startedAt,
        errors: [],
        warnings,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    success: false,
    durationMs: Date.now() - startedAt,
    errors: [normalizeReactRenderError("Runtime validation timed out before the preview became ready.")],
    warnings: [],
  };
}

export async function submitValidationReportOnce(input: {
  generationId: string;
  projectHash: string;
  compilation: CompilationValidationResult;
  runtime: RuntimeValidationResult;
  alreadySubmitted: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.alreadySubmitted) {
    return { ok: true };
  }

  const report = buildSandboxValidationRequest(input);

  try {
    await submitSandboxValidation(input.generationId, report);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to submit sandbox validation report.",
    };
  }
}
