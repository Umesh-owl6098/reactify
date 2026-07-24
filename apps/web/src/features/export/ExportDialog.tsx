import { useEffect, useId, useRef, useState } from "react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { ExportProgress } from "./ExportProgress";
import { shortenHash, type useProjectExport } from "./useProjectExport";

interface ExportDialogProps {
  status: GenerationStatusResponse;
  exportState: ReturnType<typeof useProjectExport>;
  onClose: () => void;
}

export function ExportDialog({ status, exportState, onClose }: ExportDialogProps) {
  const project = status.outputs.generatedProject!;
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [projectName, setProjectName] = useState(project.projectName);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeGenerationSummary, setIncludeGenerationSummary] = useState(false);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-white">
          Export validated project
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          The ZIP contains a standalone Vite React application with README, manifest, and generated source files.
        </p>

        <dl className="mt-4 grid gap-2 text-sm text-slate-300">
          <div className="flex justify-between gap-4">
            <dt>Validation</dt>
            <dd className="text-emerald-300">All checks passed</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Project hash</dt>
            <dd>{shortenHash(status.projectHash)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Files</dt>
            <dd>{project.files.length}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Components</dt>
            <dd>{project.components.length}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Dependencies</dt>
            <dd>{Object.keys(project.dependencies).length + Object.keys(project.devDependencies ?? {}).length}</dd>
          </div>
        </dl>

        <div className="mt-5 space-y-4">
          <label className="block text-sm text-slate-200">
            Optional project name
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={includeMetadata}
              onChange={(event) => setIncludeMetadata(event.target.checked)}
            />
            <span>
              Include Reactify metadata
              <span className="mt-1 block text-xs text-slate-400">Adds reactify-manifest.json to the ZIP.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={includeGenerationSummary}
              onChange={(event) => setIncludeGenerationSummary(event.target.checked)}
            />
            <span>
              Include generation summary
              <span className="mt-1 block text-xs text-slate-400">
                Adds a safe reactify-generation-summary.json without prompts or screenshots.
              </span>
            </span>
          </label>
        </div>

        <ExportProgress phase={exportState.phase} error={exportState.error} />

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-200" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={exportState.isSubmitting}
            aria-label="Download ZIP export"
            onClick={() =>
              void exportState.submitExport({
                projectName: projectName.trim() || undefined,
                includeMetadata,
                includeGenerationSummary,
              })
            }
          >
            Download ZIP
          </button>
        </div>
      </div>
    </div>
  );
}
