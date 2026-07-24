import { useEffect, useRef } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { isAwaitingSandboxValidation } from "../../lib/generation-api";
import { usePreviewStore } from "./previewStore";
import {
  COMPILATION_TIMEOUT_MS,
  normalizeCompilationProblems,
  performRuntimeValidation,
  submitValidationReportOnce,
} from "./useSandpackValidation";
import { type SandpackProblem } from "./sandpackDiagnostics";

interface SandpackValidationControllerProps {
  status: GenerationStatusResponse;
  projectFiles: Array<{ path: string; content: string }> | null;
  onReportSubmitted: () => void;
}

export function SandpackValidationController({
  status,
  projectFiles,
  onReportSubmitted,
}: SandpackValidationControllerProps) {
  const { sandpack } = useSandpack();
  const setPhase = usePreviewStore((state) => state.setPhase);
  const setDiagnostics = usePreviewStore((state) => state.setDiagnostics);
  const reportSubmitted = usePreviewStore((state) => state.reportSubmitted);
  const markReportSubmitted = usePreviewStore((state) => state.markReportSubmitted);
  const setReportError = usePreviewStore((state) => state.setReportError);
  const submissionRef = useRef(false);
  const compilationStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAwaitingSandboxValidation(status) || !status.projectHash || !projectFiles || reportSubmitted) {
      return;
    }

    if (sandpack.status === "running") {
      setPhase("compiling");
      compilationStartedAtRef.current ??= Date.now();
    }

    if (sandpack.status === "initial") {
      setPhase("installing");
    }
  }, [projectFiles, reportSubmitted, sandpack.status, setPhase, status]);

  useEffect(() => {
    if (!isAwaitingSandboxValidation(status) || !status.projectHash || !projectFiles || reportSubmitted) {
      return;
    }

    let cancelled = false;

    async function validateAndReport() {
      const compilationDeadline = (compilationStartedAtRef.current ?? Date.now()) + COMPILATION_TIMEOUT_MS;

      while (!cancelled && Date.now() < compilationDeadline) {
        if (sandpack.status === "idle") {
          break;
        }
        if (sandpack.error) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (cancelled || submissionRef.current || reportSubmitted) {
        return;
      }

      const problems: SandpackProblem[] = [];

      if (sandpack.error) {
        problems.push({
          message: sandpack.error.message,
          severity: "error",
          source: "sandpack",
          fileName: sandpack.error.path,
          line: sandpack.error.line,
          column: sandpack.error.column,
        });
      }

      const compilation = normalizeCompilationProblems(problems);
      compilation.durationMs = compilationStartedAtRef.current
        ? Date.now() - compilationStartedAtRef.current
        : compilation.durationMs;

      setDiagnostics({
        compilationErrors: compilation.errors,
        compilationWarnings: compilation.warnings,
      });

      if (!compilation.success) {
        setPhase("compilation_failed");
      } else {
        setPhase("runtime_validation");
      }

      const runtime = compilation.success
        ? await performRuntimeValidation({
            waitForIdle: async () => sandpack.status === "idle" || sandpack.status === "running",
            readConsoleEvents: () => [],
            hasVisibleOutput: () => true,
          })
        : {
            success: false,
            durationMs: 0,
            errors: [],
            warnings: [],
          };

      setDiagnostics({
        runtimeErrors: runtime.errors,
        runtimeWarnings: runtime.warnings,
      });

      if (!compilation.success || !runtime.success) {
        setPhase("repair_required");
      }

      setPhase("reporting");
      submissionRef.current = true;

      const submitResult = await submitValidationReportOnce({
        generationId: status.id,
        projectHash: status.projectHash!,
        compilation,
        runtime,
        alreadySubmitted: reportSubmitted,
      });

      if (cancelled) {
        return;
      }

      if (!submitResult.ok) {
        submissionRef.current = false;
        setReportError(submitResult.message);
        setPhase("report_failed");
        return;
      }

      markReportSubmitted();
      onReportSubmitted();
    }

    if ((sandpack.status === "idle" || sandpack.error) && !submissionRef.current) {
      void validateAndReport();
    }

    return () => {
      cancelled = true;
    };
  }, [
    markReportSubmitted,
    onReportSubmitted,
    projectFiles,
    reportSubmitted,
    sandpack.error,
    sandpack.status,
    setDiagnostics,
    setPhase,
    setReportError,
    status,
  ]);

  return null;
}
