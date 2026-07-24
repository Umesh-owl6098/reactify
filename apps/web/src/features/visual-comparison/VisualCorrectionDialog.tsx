import type { VisualComparisonResult } from "@reactify/generation-contracts";

interface VisualCorrectionDialogProps {
  open: boolean;
  comparison: VisualComparisonResult;
  attemptNumber: number;
  maxAttempts: number;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function VisualCorrectionDialog({
  open,
  comparison,
  attemptNumber,
  maxAttempts,
  submitting,
  onCancel,
  onConfirm,
}: VisualCorrectionDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="visual-correction-dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <h3 id="visual-correction-dialog-title" className="text-lg font-semibold text-white">
          Apply visual correction
        </h3>
        <p className="mt-2 text-sm text-slate-300">
          Current similarity score: {comparison.overallSimilarityScore.toFixed(1)}%. Attempt {attemptNumber + 1} of{" "}
          {maxAttempts}.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>{comparison.regions.length} important difference regions were detected.</li>
          <li>A new immutable version will be created.</li>
          <li>The corrected project will be recompiled and compared again.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">Region categories are heuristic estimates, not guaranteed diagnoses.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={submitting}
            onClick={onConfirm}
          >
            Apply Visual Correction
          </button>
        </div>
      </div>
    </div>
  );
}

interface VisualCorrectionProgressProps {
  phase: string;
}

export function VisualCorrectionProgress({ phase }: VisualCorrectionProgressProps) {
  return (
    <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100" aria-live="polite">
      {phase === "correcting" ? "Applying AI visual correction…" : "Awaiting Sandpack revalidation and follow-up comparison…"}
    </div>
  );
}

interface EditProgressProps {
  message: string;
}

export function VisualComparisonProgress({ message }: EditProgressProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200" aria-live="polite">
      {message}
    </div>
  );
}
