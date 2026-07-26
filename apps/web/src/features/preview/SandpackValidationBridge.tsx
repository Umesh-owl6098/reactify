import { useEffect, useRef } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { isAwaitingSandboxValidation } from "../../lib/generation-api";
import { usePreviewStore } from "./previewStore";
import { logSandbox } from "./sandboxLogger";
import {
  buildCompilationValidationResult,
  performRuntimeValidation,
  submitValidationReportOnce,
  waitForSandpackCompilation,
} from "./useSandpackValidation";

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
  const generationId = status.id;
  const projectHash = status.projectHash;
  const awaitingValidation = isAwaitingSandboxValidation(status);
  const setPhase = usePreviewStore((state) => state.setPhase);
  const setDiagnostics = usePreviewStore((state) => state.setDiagnostics);
  const reportSubmitted = usePreviewStore((state) => state.reportSubmitted);
  const markReportSubmitted = usePreviewStore((state) => state.markReportSubmitted);
  const setReportError = usePreviewStore((state) => state.setReportError);
  const submissionRef = useRef(false);
  const validationStartedRef = useRef(false);
  const activeProjectHashRef = useRef<string | null>(null);
  const projectFilesRef = useRef(projectFiles);
  const sandpackStatusRef = useRef(sandpack.status);
  const sandpackErrorRef = useRef(sandpack.error);
  const onReportSubmittedRef = useRef(onReportSubmitted);

  useEffect(() => {
    projectFilesRef.current = projectFiles;
  }, [projectFiles]);

  useEffect(() => {
    onReportSubmittedRef.current = onReportSubmitted;
  }, [onReportSubmitted]);

  useEffect(() => {
    sandpackStatusRef.current = sandpack.status;
    sandpackErrorRef.current = sandpack.error;
  }, [sandpack.error, sandpack.status]);

  useEffect(() => {
    if (projectHash && activeProjectHashRef.current !== projectHash) {
      activeProjectHashRef.current = projectHash;
      submissionRef.current = false;
      validationStartedRef.current = false;
    }
  }, [projectHash]);

  useEffect(() => {
    if (!awaitingValidation || !projectHash || !projectFiles || reportSubmitted) {
      return;
    }

    if (sandpack.status === "running") {
      setPhase("compiling");
    }

    if (sandpack.status === "initial") {
      setPhase("installing");
    }
  }, [awaitingValidation, projectFiles, projectHash, reportSubmitted, sandpack.status, setPhase]);

  useEffect(() => {
    if (!awaitingValidation || !projectHash || !projectFilesRef.current || reportSubmitted || validationStartedRef.current) {
      return;
    }

    validationStartedRef.current = true;
    let cancelled = false;
    const fileCount = projectFilesRef.current.length;

    async function validateAndReport() {
      logSandbox("validation_started", {
        generationId,
        projectHash,
        fileCount,
      });

      setPhase("compiling");

      const compilationWait = await waitForSandpackCompilation({
        readStatus: () => sandpackStatusRef.current,
        readHasError: () => Boolean(sandpackErrorRef.current),
        readError: () => {
          const finalError = sandpackErrorRef.current;
          if (!finalError) {
            return null;
          }
          return {
            message: finalError.message,
            severity: "error" as const,
            source: "sandpack",
            fileName: finalError.path,
            line: finalError.line,
            column: finalError.column,
          };
        },
        isCancelled: () => cancelled,
      });

      if (cancelled || submissionRef.current) {
        return;
      }

      logSandbox("compile_finished", {
        generationId,
        sandpackStatus: compilationWait.finalStatus,
        hasError: Boolean(compilationWait.error),
        durationMs: compilationWait.durationMs,
        timedOut: compilationWait.timedOut,
        ready: compilationWait.ready,
      });

      const compilation = buildCompilationValidationResult(compilationWait);

      setDiagnostics({
        compilationErrors: compilation.errors,
        compilationWarnings: compilation.warnings,
      });

      if (!compilation.success) {
        setPhase(compilationWait.timedOut ? "report_failed" : "compilation_failed");
      } else {
        setPhase("runtime_validation");
      }

      const runtime = compilation.success
        ? await performRuntimeValidation({
            waitForIdle: async () => {
              const currentStatus = sandpackStatusRef.current;
              return currentStatus === "idle" || currentStatus === "running";
            },
            readConsoleEvents: () => [],
            hasVisibleOutput: () => {
              const iframe = document.querySelector<HTMLIFrameElement>("[data-sandpack-preview-root] iframe");
              if (!iframe) {
                const currentStatus = sandpackStatusRef.current;
                return currentStatus === "idle" || currentStatus === "running";
              }
              return iframe.clientWidth > 0 && iframe.clientHeight > 0;
            },
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

      logSandbox("validation_post_started", {
        generationId,
        projectHash,
        compilationSuccess: compilation.success,
        runtimeSuccess: runtime.success,
      });

      const submitResult = await submitValidationReportOnce({
        generationId,
        projectHash: projectHash!,
        compilation,
        runtime,
        alreadySubmitted: usePreviewStore.getState().reportSubmitted,
      });

      if (cancelled) {
        return;
      }

      logSandbox("validation_post_finished", {
        generationId,
        ok: submitResult.ok,
        message: submitResult.ok ? undefined : submitResult.message,
      });

      if (!submitResult.ok) {
        submissionRef.current = false;
        validationStartedRef.current = false;
        setReportError(submitResult.message);
        setPhase("report_failed");
        return;
      }

      markReportSubmitted();
      onReportSubmittedRef.current();
    }

    const startTimer = window.setTimeout(() => {
      logSandbox("sandpack_mounted", {
        generationId,
        projectHash,
        initialStatus: sandpackStatusRef.current,
      });
      void validateAndReport();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (!submissionRef.current) {
        validationStartedRef.current = false;
      }
    };
  }, [
    awaitingValidation,
    generationId,
    markReportSubmitted,
    projectHash,
    reportSubmitted,
    setDiagnostics,
    setPhase,
    setReportError,
  ]);

  return null;
}
