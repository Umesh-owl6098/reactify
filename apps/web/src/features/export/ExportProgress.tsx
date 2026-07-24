import type { ExportPhase } from "./exportStore";

export function ExportProgress({ phase, error }: { phase: ExportPhase; error: string | null }) {
  if (phase === "idle") {
    return null;
  }

  const message =
    phase === "preparing"
      ? "Preparing export…"
      : phase === "ready"
        ? "Export ready. Download started."
        : error ?? "Export failed.";

  return (
    <div
      className={`mt-4 rounded-lg px-4 py-3 text-sm ${
        phase === "failed" ? "border border-red-400/30 bg-red-500/10 text-red-100" : "border border-indigo-400/30 bg-indigo-500/10 text-indigo-100"
      }`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
