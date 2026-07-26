import type { Diagnostic, SandboxValidationRequest } from "@reactify/generation-contracts";
import { submitSandboxValidation } from "../../lib/generation-api";
import {
  dedupeDiagnostics,
  normalizeCompilationTimeoutError,
  normalizeReactRenderError,
  normalizeRuntimeConsoleEvent,
  normalizeSandpackProblem,
  type RuntimeConsoleEvent,
  type SandpackProblem,
} from "./sandpackDiagnostics";

export const RUNTIME_VALIDATION_TIMEOUT_MS = 5000;
/** @deprecated Use COMPILATION_HARD_TIMEOUT_MS via waitForSandpackCompilation. */
export const COMPILATION_TIMEOUT_MS = 120000;
export const COMPILATION_HARD_TIMEOUT_MS = 120000;
export const COMPILATION_POLL_INTERVAL_MS = 100;

const COMPILATION_READY_STATUSES = new Set(["idle", "running"]);

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

export function isSandpackCompilationReady(status: string, hasError: boolean): boolean {
  return !hasError && COMPILATION_READY_STATUSES.has(status);
}

export async function waitForSandpackCompilation(input: {
  readStatus: () => string;
  readHasError: () => boolean;
  readError: () => SandpackProblem | null;
  isCancelled?: () => boolean;
  hardTimeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<{
  ready: boolean;
  timedOut: boolean;
  durationMs: number;
  finalStatus: string;
  error: SandpackProblem | null;
}> {
  const startedAt = Date.now();
  const hardTimeoutMs = input.hardTimeoutMs ?? COMPILATION_HARD_TIMEOUT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? COMPILATION_POLL_INTERVAL_MS;
  const deadline = startedAt + hardTimeoutMs;

  while (!input.isCancelled?.() && Date.now() < deadline) {
    const error = input.readError();
    if (error) {
      return {
        ready: false,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        finalStatus: input.readStatus(),
        error,
      };
    }

    const status = input.readStatus();
    if (isSandpackCompilationReady(status, false)) {
      return {
        ready: true,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        finalStatus: status,
        error: null,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    ready: false,
    timedOut: true,
    durationMs: Date.now() - startedAt,
    finalStatus: input.readStatus(),
    error: input.readHasError() ? input.readError() : null,
  };
}

export function buildCompilationValidationResult(input: {
  ready: boolean;
  timedOut: boolean;
  durationMs: number;
  finalStatus: string;
  error: SandpackProblem | null;
  hardTimeoutMs?: number;
}): CompilationValidationResult {
  const hardTimeoutMs = input.hardTimeoutMs ?? COMPILATION_HARD_TIMEOUT_MS;

  if (input.ready) {
    return {
      success: true,
      durationMs: input.durationMs,
      errors: [],
      warnings: [],
    };
  }

  if (input.timedOut) {
    return {
      success: false,
      durationMs: input.durationMs,
      errors: [normalizeCompilationTimeoutError(input.finalStatus, hardTimeoutMs)],
      warnings: [],
    };
  }

  const problems: SandpackProblem[] = [];
  if (input.error) {
    problems.push(input.error);
  } else {
    problems.push({
      message: `Sandpack compilation did not become ready (last status: ${input.finalStatus}).`,
      severity: "error",
      source: "sandpack",
      code: "SANDBOX_COMPILATION_FAILED",
    });
  }

  const compilation = normalizeCompilationProblems(problems);
  compilation.durationMs = input.durationMs;
  return compilation;
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
