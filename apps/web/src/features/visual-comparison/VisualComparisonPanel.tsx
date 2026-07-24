import { useState } from "react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { ComparisonSummary, DifferenceRegionList } from "./ComparisonSummary";
import { ScreenshotCaptureController } from "./ScreenshotCaptureController";
import { SimilarityScore } from "./SimilarityScore";
import { useVisualComparison } from "./useVisualComparison";
import { VisualComparisonHistory } from "./VisualComparisonHistory";
import { VisualCorrectionDialog, VisualCorrectionProgress, VisualComparisonProgress } from "./VisualCorrectionDialog";
import { VisualDiffViewer } from "./VisualDiffViewer";
import { useVisualComparisonStore, VIEWPORT_DIMENSIONS } from "./visualComparisonStore";

interface VisualComparisonPanelProps {
  status: GenerationStatusResponse;
  onRefreshStatus: () => void;
}

export function VisualComparisonPanel({ status, onRefreshStatus }: VisualComparisonPanelProps) {
  const { store, startComparison, submitScreenshot, confirmCorrection, loadHistory } = useVisualComparison(
    status,
    onRefreshStatus,
  );
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const diffMode = useVisualComparisonStore((state) => state.diffMode);
  const setDiffMode = useVisualComparisonStore((state) => state.setDiffMode);
  const selectedRegionId = useVisualComparisonStore((state) => state.selectedRegionId);
  const setSelectedRegionId = useVisualComparisonStore((state) => state.setSelectedRegionId);

  const blockedReason = status.visualComparisonBlockedReason?.replaceAll("_", " ");
  const comparison = store.activeComparison;
  const canCompare = status.visualComparisonAllowed && status.status === "Ready";

  return (
    <section
      className="space-y-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/5 p-5"
      aria-labelledby="visual-comparison-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="visual-comparison-heading" className="text-lg font-semibold text-white">
            Compare with Original
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Capture the Sandpack preview and compare it against the uploaded source screenshot.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canCompare || store.submitting}
          onClick={() => void startComparison()}
        >
          Compare with Original
        </button>
      </div>

      {!canCompare && blockedReason ? (
        <p className="text-sm text-amber-200" role="status">
          Visual comparison unavailable: {blockedReason}.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(VIEWPORT_DIMENSIONS) as Array<keyof typeof VIEWPORT_DIMENSIONS>).map((preset) => (
          <button
            key={preset}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              store.viewportPreset === preset ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-200"
            }`}
            onClick={() => store.setViewportPreset(preset)}
          >
            {preset}
          </button>
        ))}
      </div>

      {store.phase === "creating" || store.phase === "capturing" || store.phase === "processing" ? (
        <VisualComparisonProgress
          message={
            store.phase === "creating"
              ? "Starting visual comparison…"
              : store.phase === "capturing"
                ? "Capturing preview screenshot…"
                : "Processing visual comparison…"
          }
        />
      ) : null}

      {store.phase === "correcting" || store.phase === "awaiting_revalidation" ? (
        <VisualCorrectionProgress phase={store.phase} />
      ) : null}

      {store.error ? (
        <p className="text-sm text-rose-200" role="alert">
          {store.error}
        </p>
      ) : null}

      {comparison && ["completed", "correction_available"].includes(comparison.status) ? (
        <div className="space-y-4">
          <SimilarityScore
            similarity={comparison.overallSimilarityScore}
            pixelDifference={comparison.pixelDifferencePercentage}
            structuralDifference={comparison.structuralDifferenceScore}
          />
          <ComparisonSummary comparison={comparison} />
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Comparison view modes">
            {(["side-by-side", "overlay", "diff"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={diffMode === mode}
                className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                  diffMode === mode ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-200"
                }`}
                onClick={() => setDiffMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <VisualDiffViewer
            generationId={status.id}
            comparison={comparison}
            mode={diffMode}
            selectedRegionId={selectedRegionId}
          />
          <DifferenceRegionList
            regions={comparison.regions}
            selectedRegionId={selectedRegionId}
            onSelectRegion={setSelectedRegionId}
          />
          {status.visualCorrectionAvailable ? (
            <button
              type="button"
              className="rounded-lg border border-indigo-400 px-4 py-2 text-sm text-indigo-100"
              onClick={() => setShowCorrectionDialog(true)}
            >
              Apply AI Visual Correction
            </button>
          ) : null}
        </div>
      ) : null}

      <VisualCorrectionDialog
        open={showCorrectionDialog}
        comparison={comparison ?? {
          comparisonId: "",
          generationId: status.id,
          versionId: "",
          projectHash: "",
          status: "completed",
          sourceImage: { width: 0, height: 0 },
          previewImage: { width: 0, height: 0 },
          viewport: VIEWPORT_DIMENSIONS.desktop,
          overallSimilarityScore: 0,
          pixelDifferencePercentage: 0,
          structuralDifferenceScore: 0,
          regions: [],
          summary: "",
          correctionRecommended: false,
          createdAt: new Date().toISOString(),
        }}
        attemptNumber={status.visualCorrectionAttempt}
        maxAttempts={status.visualCorrectionMaxAttempts}
        submitting={store.submitting}
        onCancel={() => setShowCorrectionDialog(false)}
        onConfirm={() => {
          setShowCorrectionDialog(false);
          void confirmCorrection();
        }}
      />

      <ScreenshotCaptureController
        status={status}
        enabled={Boolean(comparison?.status === "awaiting_capture" || status.previewCaptureRequired)}
        onCapture={submitScreenshot}
      />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Comparison history</h3>
        <div className="mt-2">
          <VisualComparisonHistory comparisons={store.history} />
        </div>
        <button
          type="button"
          className="mt-3 text-sm text-indigo-200 underline"
          onClick={() => void loadHistory()}
        >
          Refresh history
        </button>
      </div>
    </section>
  );
}
