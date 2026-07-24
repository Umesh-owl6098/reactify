import { useCallback, useEffect, useRef } from "react";
import type { GenerationStatusResponse, VisualComparisonResult } from "@reactify/generation-contracts";
import {
  applyVisualCorrection,
  createVisualComparison,
  fetchVisualComparisonHistory,
  submitVisualComparisonScreenshot,
} from "../../lib/generation-api";
import { VIEWPORT_DIMENSIONS, useVisualComparisonStore } from "./visualComparisonStore";

export function useVisualComparison(
  status: GenerationStatusResponse | null,
  onRefreshStatus: () => void,
): {
  store: ReturnType<typeof useVisualComparisonStore.getState>;
  loadHistory: () => Promise<void>;
  startComparison: () => Promise<void>;
  submitScreenshot: (screenshotBase64: string) => Promise<void>;
  confirmCorrection: () => Promise<void>;
} {
  const store = useVisualComparisonStore();
  const submittingRef = useRef(false);

  const loadHistory = useCallback(async () => {
    if (!status) {
      return;
    }
    const response = await fetchVisualComparisonHistory(status.id);
    store.setHistory(response.comparisons);
  }, [status, store]);

  useEffect(() => {
    if (!status) {
      return;
    }
    void loadHistory().catch(() => undefined);
  }, [loadHistory, status]);

  useEffect(() => {
    if (!status?.activeComparisonId || !status.activeComparisonStatus) {
      return;
    }

    if (status.activeComparisonStatus === "awaiting_capture" || status.previewCaptureRequired) {
      store.setPhase("capturing");
    } else if (status.activeComparisonStatus === "processing") {
      store.setPhase("processing");
    } else if (status.activeComparisonStatus === "awaiting_revalidation") {
      store.setPhase("awaiting_revalidation");
    }
  }, [status?.activeComparisonId, status?.activeComparisonStatus, status?.previewCaptureRequired, store]);

  const handleComparisonResponse = useCallback(
    async (comparison: VisualComparisonResult) => {
      store.setActiveComparison(comparison);

      if (comparison.status === "awaiting_capture") {
        store.setPhase("capturing");
        return;
      }

      if (comparison.status === "processing") {
        store.setPhase("processing");
        return;
      }

      if (comparison.status === "correction_available") {
        store.setPhase("completed");
        await loadHistory();
        return;
      }

      if (comparison.status === "awaiting_revalidation") {
        store.setPhase("awaiting_revalidation");
        onRefreshStatus();
        return;
      }

      if (comparison.status === "completed") {
        store.setPhase("completed");
        await loadHistory();
        return;
      }

      if (comparison.status === "failed") {
        store.setPhase("failed");
        store.setError(comparison.failureReason ?? "Visual comparison failed.");
      }
    },
    [loadHistory, onRefreshStatus, store],
  );

  const startComparison = useCallback(async () => {
    if (!status?.projectHash || !status.visualComparisonAllowed || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    store.setSubmitting(true);
    store.setPhase("creating");
    store.setError(null);

    try {
      const viewport = VIEWPORT_DIMENSIONS[store.viewportPreset];
      const comparison = await createVisualComparison(status.id, {
        expectedProjectHash: status.projectHash,
        viewport,
      });
      await handleComparisonResponse(comparison);
    } catch (error) {
      store.setPhase("failed");
      store.setError(error instanceof Error ? error.message : "Failed to start visual comparison.");
    } finally {
      submittingRef.current = false;
      store.setSubmitting(false);
    }
  }, [handleComparisonResponse, status, store]);

  const submitScreenshot = useCallback(
    async (screenshotBase64: string) => {
      if (!status?.projectHash || !store.activeComparison) {
        return;
      }

      store.setPhase("processing");
      store.setError(null);

      try {
        const comparison = await submitVisualComparisonScreenshot(
          status.id,
          store.activeComparison.comparisonId,
          {
            expectedProjectHash: status.projectHash,
            viewport: store.activeComparison.viewport,
            imageFormat: "png",
            screenshotBase64,
            capturedAt: new Date().toISOString(),
          },
        );
        await handleComparisonResponse(comparison);
      } catch (error) {
        store.setPhase("failed");
        store.setError(error instanceof Error ? error.message : "Failed to submit preview screenshot.");
      }
    },
    [handleComparisonResponse, status, store],
  );

  const confirmCorrection = useCallback(async () => {
    if (!status?.projectHash || !store.activeComparison) {
      return;
    }

    store.setSubmitting(true);
    store.setPhase("correcting");
    store.setError(null);

    try {
      const comparison = await applyVisualCorrection(status.id, store.activeComparison.comparisonId, {
        expectedProjectHash: status.projectHash,
      });
      await handleComparisonResponse(comparison);
      onRefreshStatus();
    } catch (error) {
      store.setPhase("failed");
      store.setError(error instanceof Error ? error.message : "Visual correction failed.");
    } finally {
      store.setSubmitting(false);
    }
  }, [handleComparisonResponse, onRefreshStatus, status, store]);

  return {
    store,
    loadHistory,
    startComparison,
    submitScreenshot,
    confirmCorrection,
  };
}
