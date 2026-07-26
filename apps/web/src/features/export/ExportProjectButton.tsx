import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { ExportDialog } from "./ExportDialog";
import { ExportHistory } from "./ExportHistory";
import { useProjectExport } from "./useProjectExport";

interface ExportProjectButtonProps {
  status: GenerationStatusResponse;
  onRefreshStatus: () => void;
}

export function ExportProjectPanel({ status, onRefreshStatus }: ExportProjectButtonProps) {
  const exportState = useProjectExport(status, onRefreshStatus);
  const project = status.outputs.generatedProject;

  if (!project) {
    return null;
  }

  return (
    <section className="space-y-4" aria-labelledby="export-project-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="export-project-heading" className="text-sm font-semibold text-white">
            Export project
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            Download a standalone Vite React application as a ZIP archive.
          </p>
          {!exportState.exportAllowed && exportState.exportBlockedReason ? (
            <p className="mt-2 text-sm text-amber-200" role="status">
              Export unavailable: {exportState.exportBlockedReason.replaceAll("_", " ")}.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!exportState.exportAllowed || exportState.isSubmitting}
          aria-label="Export project as ZIP"
          onClick={exportState.openDialog}
        >
          Export project
        </button>
      </div>

      <ExportHistory
        history={exportState.history}
        isDownloading={exportState.isDownloading}
        downloadError={exportState.downloadError}
        onDownloadAgain={(exportId, filename) => void exportState.downloadAgain(exportId, filename)}
      />

      {exportState.isDialogOpen ? (
        <ExportDialog status={status} exportState={exportState} onClose={exportState.closeDialog} />
      ) : null}
    </section>
  );
}
