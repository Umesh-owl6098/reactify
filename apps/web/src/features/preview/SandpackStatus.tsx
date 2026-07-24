import { usePreviewStore, type PreviewPhase } from "./previewStore";

const PHASE_LABELS: Record<PreviewPhase, string> = {
  idle: "Preparing preview",
  preparing: "Preparing preview",
  installing: "Installing dependencies",
  compiling: "Compiling",
  compilation_failed: "Compilation failed",
  running: "Running application",
  runtime_validation: "Runtime validation",
  reporting: "Submitting validation report",
  ready: "Preview ready",
  repair_required: "Repair required",
  report_failed: "Validation report failed",
};

const PHASE_TONE: Record<PreviewPhase, string> = {
  idle: "text-slate-300",
  preparing: "text-indigo-200",
  installing: "text-indigo-200",
  compiling: "text-indigo-200",
  compilation_failed: "text-red-300",
  running: "text-indigo-200",
  runtime_validation: "text-indigo-200",
  reporting: "text-indigo-200",
  ready: "text-emerald-300",
  repair_required: "text-amber-300",
  report_failed: "text-red-300",
};

export function SandpackStatus() {
  const phase = usePreviewStore((state) => state.phase);
  const reportError = usePreviewStore((state) => state.reportError);

  return (
    <div
      className={`rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 ${PHASE_TONE[phase]}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">{PHASE_LABELS[phase]}</p>
      {reportError ? <p className="mt-1 text-sm text-red-200">{reportError}</p> : null}
    </div>
  );
}
