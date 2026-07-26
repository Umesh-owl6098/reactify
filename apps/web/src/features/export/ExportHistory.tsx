import type { ExportSummary } from "@reactify/generation-contracts";
import { ExportSummaryCard } from "./ExportSummaryCard";

export function ExportHistory({
  history,
  isDownloading,
  downloadError,
  onDownloadAgain,
}: {
  history: ExportSummary[];
  isDownloading: boolean;
  downloadError: string | null;
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
      {downloadError ? (
        <p className="text-sm text-red-200" role="alert">
          Download failed: {downloadError}
        </p>
      ) : null}
      {history.map((entry) => (
        <ExportSummaryCard
          key={entry.exportId}
          summary={entry}
          isDownloading={isDownloading}
          onDownloadAgain={onDownloadAgain}
        />
      ))}
    </section>
  );
}
