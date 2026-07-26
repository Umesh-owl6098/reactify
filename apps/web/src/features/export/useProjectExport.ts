import { useCallback, useEffect, useRef } from "react";
import type { ExportRequest, GenerationStatusResponse } from "@reactify/generation-contracts";
import {
  createProjectExport,
  downloadProjectExport,
  fetchExportHistory,
  formatDownloadErrorMessage,
  formatExportErrorMessage,
} from "../../lib/generation-api";
import { useGenerationScopedFetch } from "../generation/useGenerationScopedFetch";
import { keepGenerationRecord, keepGenerationRecords } from "../generation/generationScopedRecords";
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
    isDownloading,
    downloadError,
    openDialog,
    closeDialog,
    setPhase,
    setError,
    setLatestSummary,
    setHistory,
    setSubmitting,
    setDownloading,
    setDownloadError,
  } = useExportStore();
  const submittingRef = useRef(false);
  const downloadingRef = useRef(false);
  const generationId = status?.id ?? null;

  const resetStore = useCallback(() => {
    useExportStore.getState().reset();
  }, []);

  const { runFetch } = useGenerationScopedFetch({ generationId, onGenerationChange: resetStore });

  useEffect(() => {
    const scoped = keepGenerationRecord(status?.latestExportSummary ?? null, generationId);

    // The store is subscribed to wholesale, so an unconditional write here would
    // re-render on every status poll and loop whenever the caller rebuilds the
    // status object.
    const current = useExportStore.getState().latestSummary;
    if (current?.exportId === scoped?.exportId && current?.status === scoped?.status) {
      return;
    }

    setLatestSummary(scoped);
  }, [generationId, setLatestSummary, status?.latestExportSummary]);

  const loadHistory = useCallback(
    async (force = true) => {
      await runFetch(async (scope) => {
        const response = await fetchExportHistory(scope.generationId);
        if (scope.isStale()) {
          return;
        }
        setHistory(keepGenerationRecords(response.exports, scope.generationId));
      }, { force });
    },
    [runFetch, setHistory],
  );

  useEffect(() => {
    if (!status?.id) {
      return;
    }

    // Export history is read-only and must render even while new exports are blocked,
    // so a failed or stale export can be inspected instead of silently hiding history.
    void loadHistory().catch(() => undefined);
  }, [loadHistory, status?.exportAllowed, status?.id, status?.latestExportSummary?.status, status?.status]);

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
          try {
            await downloadProjectExport(status.id, summary.exportId, summary.filename);
          } catch (downloadError) {
            setDownloadError(formatDownloadErrorMessage(downloadError));
          }
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
    [loadHistory, onRefreshStatus, setDownloadError, setError, setLatestSummary, setPhase, setSubmitting, status],
  );

  const downloadAgain = useCallback(
    async (exportId: string, filename: string) => {
      if (!status || downloadingRef.current) {
        return;
      }

      downloadingRef.current = true;
      setDownloading(true);
      setDownloadError(null);

      try {
        await downloadProjectExport(status.id, exportId, filename);
      } catch (downloadError) {
        setDownloadError(formatDownloadErrorMessage(downloadError));
      } finally {
        downloadingRef.current = false;
        setDownloading(false);
      }
    },
    [setDownloadError, setDownloading, status],
  );

  return {
    isDialogOpen,
    phase,
    error,
    latestSummary,
    history,
    isSubmitting,
    isDownloading,
    downloadError,
    exportAllowed: status?.exportAllowed ?? false,
    exportBlockedReason: status?.exportBlockedReason ?? null,
    openDialog,
    closeDialog,
    submitExport,
    downloadAgain,
    loadHistory,
  };
}
