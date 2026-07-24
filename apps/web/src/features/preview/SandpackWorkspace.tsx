import type { ReactNode } from "react";
import { usePreviewStore, validateCustomViewport, VIEWPORT_PRESETS } from "./previewStore";

interface SandpackWorkspaceProps {
  preview: ReactNode;
  status: ReactNode;
  diagnostics: ReactNode;
}

export function SandpackWorkspace({ preview, status, diagnostics }: SandpackWorkspaceProps) {
  return (
    <section className="space-y-4" aria-labelledby="sandpack-workspace-heading">
      <div>
        <h3 id="sandpack-workspace-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Live preview
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          Generated code compiles in an isolated Sandpack preview inside your browser.
        </p>
      </div>

      <ViewportControls />
      {status}
      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
        <div className="min-h-[420px] p-2">{preview}</div>
      </div>
      {diagnostics}
    </section>
  );
}

function ViewportControls() {
  const viewport = usePreviewStore((state) => state.viewport);
  const fitToContainer = usePreviewStore((state) => state.fitToContainer);
  const actualSize = usePreviewStore((state) => state.actualSize);
  const setViewportPreset = usePreviewStore((state) => state.setViewportPreset);
  const setCustomViewport = usePreviewStore((state) => state.setCustomViewport);
  const toggleFitToContainer = usePreviewStore((state) => state.toggleFitToContainer);
  const toggleActualSize = usePreviewStore((state) => state.toggleActualSize);
  const reloadPreview = usePreviewStore((state) => state.reloadPreview);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(VIEWPORT_PRESETS) as Array<keyof typeof VIEWPORT_PRESETS>).map((preset) => {
        const active = viewport.preset === preset;
        return (
          <button
            key={preset}
            type="button"
            aria-label={`${preset} viewport`}
            aria-pressed={active}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${
              active ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-200"
            }`}
            onClick={() => setViewportPreset(preset)}
          >
            {preset}
          </button>
        );
      })}

      <label className="ml-2 flex items-center gap-2 text-xs text-slate-300">
        <span>Custom</span>
        <input
          aria-label="Custom viewport width"
          type="number"
          min={240}
          max={2400}
          value={viewport.preset === "custom" ? viewport.width : ""}
          placeholder={`${VIEWPORT_PRESETS.desktop.width}`}
          className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1"
          onChange={(event) => {
            const width = Number(event.target.value);
            const height = viewport.preset === "custom" ? viewport.height : VIEWPORT_PRESETS.desktop.height;
            if (validateCustomViewport(width, height).ok) {
              setCustomViewport(width, height);
            }
          }}
        />
        <span>×</span>
        <input
          aria-label="Custom viewport height"
          type="number"
          min={320}
          max={2400}
          value={viewport.preset === "custom" ? viewport.height : ""}
          placeholder={`${VIEWPORT_PRESETS.desktop.height}`}
          className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1"
          onChange={(event) => {
            const height = Number(event.target.value);
            const width = viewport.preset === "custom" ? viewport.width : VIEWPORT_PRESETS.desktop.width;
            if (validateCustomViewport(width, height).ok) {
              setCustomViewport(width, height);
            }
          }}
        />
      </label>

      <button
        type="button"
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
        onClick={reloadPreview}
      >
        Reload preview
      </button>
      <button
        type="button"
        aria-pressed={fitToContainer}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
        onClick={toggleFitToContainer}
      >
        Fit to container
      </button>
      <button
        type="button"
        aria-pressed={actualSize}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
        onClick={toggleActualSize}
      >
        Actual size
      </button>
    </div>
  );
}
