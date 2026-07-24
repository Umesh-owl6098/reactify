import { useCallback, useEffect, useRef } from "react";
import type { ExportRequest, GenerationStatusResponse } from "@reactify/generation-contracts";
import {
  createProjectExport,
  downloadProjectExport,
  fetchExportHistory,
  formatExportErrorMessage,
} from "../../lib/generation-api";
import { useExportStore } from "./exportStore";

export function shortenHash(value: string | null | undefined, length = 12): string {
  if (!value) {
    return "—";
  }
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function useProjectExport(status: GenerationStatusResponse | null, onRefreshStatus: () => void) {
  const {
    isDialogOpen,
    phase,
    error,
    latestSummary,
    history,
    isSubmitting,
    openDialog,
    closeDialog,
    setPhase,
    setError,
    setLatestSummary,
    setHistory,
    setSubmitting,
  } = useExportStore();
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!status?.latestExportSummary) {
      return;
    }
    setLatestSummary(status.latestExportSummary);
  }, [setLatestSummary, status?.latestExportSummary]);

  const loadHistory = useCallback(async () => {
    if (!status) {
      return;
    }
    const response = await fetchExportHistory(status.id);
    setHistory(response.exports);
  }, [setHistory, status]);

  useEffect(() => {
    if (!status?.exportAllowed) {
      return;
    }
    void loadHistory().catch(() => undefined);
  }, [loadHistory, status?.exportAllowed, status?.id]);

  const submitExport = useCallback(
    async (request: ExportRequest) => {
      if (!status || submittingRef.current || !status.exportAllowed) {
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setPhase("preparing");
      setError(null);

      try {
        const summary = await createProjectExport(status.id, request);
        setLatestSummary(summary);
        if (summary.status === "ready") {
          setPhase("ready");
          await downloadProjectExport(status.id, summary.exportId, summary.filename);
          await loadHistory();
          onRefreshStatus();
        } else {
          setPhase("failed");
          setError(summary.failureReason ?? "Export failed.");
        }
      } catch (exportError) {
        setPhase("failed");
        setError(formatExportErrorMessage(exportError));
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [loadHistory, onRefreshStatus, setError, setLatestSummary, setPhase, setSubmitting, status],
  );

  const downloadAgain = useCallback(
    async (exportId: string, filename: string) => {
      if (!status) {
        return;
      }
      await downloadProjectExport(status.id, exportId, filename);
    },
    [status],
  );

  return {
    isDialogOpen,
    phase,
    error,
    latestSummary,
    history,
    isSubmitting,
    exportAllowed: status?.exportAllowed ?? false,
    exportBlockedReason: status?.exportBlockedReason ?? null,
    openDialog,
    closeDialog,
    submitExport,
    downloadAgain,
    loadHistory,
  };
}
