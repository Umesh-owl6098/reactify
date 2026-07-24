import type { ExportSummary } from "@reactify/generation-contracts";
import { ExportSummaryCard } from "./ExportSummaryCard";

export function ExportHistory({
  history,
  onDownloadAgain,
}: {
  history: ExportSummary[];
  onDownloadAgain: (exportId: string, filename: string) => void;
}) {
  if (history.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="export-history-heading" className="space-y-3">
      <h4 id="export-history-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Export history
      </h4>
      {history.map((entry) => (
        <ExportSummaryCard key={entry.exportId} summary={entry} onDownloadAgain={onDownloadAgain} />
      ))}
    </section>
  );
}
