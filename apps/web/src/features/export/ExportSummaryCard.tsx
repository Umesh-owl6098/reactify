import type { ExportSummary } from "@reactify/generation-contracts";
import { shortenHash } from "./useProjectExport";

export function ExportSummaryCard({
  summary,
  onDownloadAgain,
}: {
  summary: ExportSummary;
  onDownloadAgain: (exportId: string, filename: string) => void;
}) {
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{summary.filename}</p>
          <p className="mt-1 text-xs text-slate-400">
            Version v{summary.versionNumber} · {summary.fileCount} files · {summary.totalSizeBytes} bytes
          </p>
          <p className="mt-1 text-xs text-slate-400">Hash {shortenHash(summary.projectHash)}</p>
          <p className="mt-1 text-xs text-slate-500">Created {new Date(summary.createdAt).toLocaleString()}</p>
          {summary.failureReason ? <p className="mt-2 text-sm text-red-200">{summary.failureReason}</p> : null}
        </div>
        {summary.status === "ready" ? (
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-100"
            aria-label={`Download ${summary.filename} again`}
            onClick={() => onDownloadAgain(summary.exportId, summary.filename)}
          >
            Download again
          </button>
        ) : (
          <span className="text-xs uppercase tracking-wide text-slate-400">{summary.status}</span>
        )}
      </div>
    </article>
  );
}
