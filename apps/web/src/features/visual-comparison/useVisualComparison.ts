import { useCallback, useEffect, useRef } from "react";
import type { GenerationStatusResponse, VisualComparisonResult } from "@reactify/generation-contracts";
import {
  applyVisualCorrection,
  createVisualComparison,
  fetchVisualComparison,
  fetchVisualComparisonHistory,
  submitVisualComparisonScreenshot,
} from "../../lib/generation-api";
import { useGenerationScopedFetch } from "../generation/useGenerationScopedFetch";
import { keepGenerationRecords } from "../generation/generationScopedRecords";
import { VIEWPORT_DIMENSIONS, useVisualComparisonStore } from "./visualComparisonStore";

export function useVisualComparison(
  status: GenerationStatusResponse | null,
  onRefreshStatus: () => void,
) {
  const submittingRef = useRef(false);
  const generationId = status?.id ?? null;
  const activeComparisonId = status?.activeComparisonId ?? null;
  const activeComparisonStatus = status?.activeComparisonStatus ?? null;
  const previewCaptureRequired = status?.previewCaptureRequired ?? false;

  const phase = useVisualComparisonStore((state) => state.phase);
  const activeComparison = useVisualComparisonStore((state) => state.activeComparison);
  const history = useVisualComparisonStore((state) => state.history);
  const selectedRegionId = useVisualComparisonStore((state) => state.selectedRegionId);
  const diffMode = useVisualComparisonStore((state) => state.diffMode);
  const viewportPreset = useVisualComparisonStore((state) => state.viewportPreset);
  const error = useVisualComparisonStore((state) => state.error);
  const submitting = useVisualComparisonStore((state) => state.submitting);
  const captureAttempt = useVisualComparisonStore((state) => state.captureAttempt);
  const setPhase = useVisualComparisonStore((state) => state.setPhase);
  const setActiveComparison = useVisualComparisonStore((state) => state.setActiveComparison);
  const setHistory = useVisualComparisonStore((state) => state.setHistory);
  const setSelectedRegionId = useVisualComparisonStore((state) => state.setSelectedRegionId);
  const setDiffMode = useVisualComparisonStore((state) => state.setDiffMode);
  const setViewportPreset = useVisualComparisonStore((state) => state.setViewportPreset);
  const setError = useVisualComparisonStore((state) => state.setError);
  const setSubmitting = useVisualComparisonStore((state) => state.setSubmitting);
  const incrementCaptureAttempt = useVisualComparisonStore((state) => state.incrementCaptureAttempt);

  const resetStore = useCallback(() => {
    useVisualComparisonStore.getState().reset();
  }, []);

  const { runFetch } = useGenerationScopedFetch({
    generationId,
    onGenerationChange: resetStore,
  });

  const loadHistory = useCallback(
    async (force = false) => {
      await runFetch(async (scope) => {
        const response = await fetchVisualComparisonHistory(scope.generationId);
        if (scope.isStale()) {
          return;
        }
        setHistory(keepGenerationRecords(response.comparisons, scope.generationId));
      }, { force });
    },
    [runFetch, setHistory],
  );

  useEffect(() => {
    // Comparison history is supplementary; a load failure must not surface as an
    // unhandled rejection or block the comparison controls.
    void loadHistory().catch(() => undefined);
  }, [generationId, loadHistory]);

  useEffect(() => {
    if (!generationId || !activeComparisonId) {
      return;
    }

    if (activeComparison?.comparisonId === activeComparisonId) {
      return;
    }

    const fromHistory = history.find((comparison) => comparison.comparisonId === activeComparisonId);
    if (fromHistory) {
      setActiveComparison(fromHistory);
      return;
    }

    void fetchVisualComparison(generationId, activeComparisonId)
      .then((comparison) => setActiveComparison(comparison))
      .catch(() => undefined);
  }, [
    activeComparison?.comparisonId,
    activeComparisonId,
    generationId,
    history,
    setActiveComparison,
  ]);

  useEffect(() => {
    if (!activeComparisonId || !activeComparisonStatus) {
      return;
    }

    if (activeComparisonStatus === "awaiting_capture" || previewCaptureRequired) {
      setPhase("capturing");
      return;
    }

    if (activeComparisonStatus === "processing") {
      setPhase("processing");
      return;
    }

    if (activeComparisonStatus === "awaiting_revalidation") {
      setPhase("awaiting_revalidation");
      return;
    }

    if (activeComparisonStatus === "failed") {
      setPhase("failed");
    }
  }, [activeComparisonId, activeComparisonStatus, previewCaptureRequired, setPhase]);

  const handleComparisonResponse = useCallback(
    async (comparison: VisualComparisonResult) => {
      setActiveComparison(comparison);

      if (comparison.status === "awaiting_capture") {
        setPhase("capturing");
        setError(null);
        return;
      }

      if (comparison.status === "processing") {
        setPhase("processing");
        return;
      }

      if (comparison.status === "correction_available") {
        setPhase("completed");
        await loadHistory(true);
        onRefreshStatus();
        return;
      }

      if (comparison.status === "awaiting_revalidation") {
        setPhase("awaiting_revalidation");
        onRefreshStatus();
        return;
      }

      if (comparison.status === "completed") {
        setPhase("completed");
        await loadHistory(true);
        onRefreshStatus();
        return;
      }

      if (comparison.status === "failed") {
        setPhase("failed");
        setError(comparison.failureReason ?? "Visual comparison failed.");
        onRefreshStatus();
      }
    },
    [loadHistory, onRefreshStatus, setActiveComparison, setError, setPhase],
  );

  const startComparison = useCallback(async () => {
    if (!status?.projectHash || !status.visualComparisonAllowed || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setPhase("creating");
    setError(null);

    try {
      const viewport = VIEWPORT_DIMENSIONS[viewportPreset];
      const comparison = await createVisualComparison(status.id, {
        expectedProjectHash: status.projectHash,
        viewport,
      });
      await handleComparisonResponse(comparison);
      onRefreshStatus();
    } catch (loadError) {
      setPhase("failed");
      setError(loadError instanceof Error ? loadError.message : "Failed to start visual comparison.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [handleComparisonResponse, onRefreshStatus, setError, setPhase, setSubmitting, status, viewportPreset]);

  const submitScreenshot = useCallback(
    async (screenshotBase64: string) => {
      const comparisonId = activeComparison?.comparisonId ?? activeComparisonId;
      if (!status?.projectHash || !comparisonId) {
        setPhase("failed");
        setError("Visual comparison context was lost before screenshot upload. Retry the comparison.");
        return;
      }

      setPhase("processing");
      setError(null);

      try {
        const comparison = await submitVisualComparisonScreenshot(status.id, comparisonId, {
          expectedProjectHash: status.projectHash,
          viewport: activeComparison?.viewport ?? VIEWPORT_DIMENSIONS[viewportPreset],
          imageFormat: "png",
          screenshotBase64,
          capturedAt: new Date().toISOString(),
        });
        await handleComparisonResponse(comparison);
      } catch (loadError) {
        setPhase("failed");
        setError(loadError instanceof Error ? loadError.message : "Failed to submit preview screenshot.");
      }
    },
    [
      activeComparison,
      activeComparisonId,
      handleComparisonResponse,
      setError,
      setPhase,
      status,
      viewportPreset,
    ],
  );

  const retryCapture = useCallback(() => {
    setError(null);
    setPhase("capturing");
    incrementCaptureAttempt();
  }, [incrementCaptureAttempt, setError, setPhase]);

  const handleCaptureError = useCallback(
    (message: string) => {
      setPhase("failed");
      setError(message);
    },
    [setError, setPhase],
  );

  const confirmCorrection = useCallback(async () => {
    if (!status?.projectHash || !activeComparison) {
      return;
    }

    setSubmitting(true);
    setPhase("correcting");
    setError(null);

    try {
      const comparison = await applyVisualCorrection(status.id, activeComparison.comparisonId, {
        expectedProjectHash: status.projectHash,
      });
      await handleComparisonResponse(comparison);
      onRefreshStatus();
    } catch (loadError) {
      setPhase("failed");
      setError(loadError instanceof Error ? loadError.message : "Visual correction failed.");
    } finally {
      setSubmitting(false);
    }
  }, [activeComparison, handleComparisonResponse, onRefreshStatus, setError, setPhase, setSubmitting, status]);

  return {
    store: {
      phase,
      activeComparison,
      history,
      selectedRegionId,
      diffMode,
      viewportPreset,
      error,
      submitting,
      captureAttempt,
      setPhase,
      setActiveComparison,
      setHistory,
      setSelectedRegionId,
      setDiffMode,
      setViewportPreset,
      setError,
      setSubmitting,
    },
    loadHistory,
    startComparison,
    submitScreenshot,
    retryCapture,
    handleCaptureError,
    confirmCorrection,
  };
}
