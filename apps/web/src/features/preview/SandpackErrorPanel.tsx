import type { Diagnostic } from "@reactify/generation-contracts";
import { usePreviewStore } from "./previewStore";

interface SandpackErrorPanelProps {
  onSelectFile?: (path: string) => void;
}

export function SandpackErrorPanel({ onSelectFile }: SandpackErrorPanelProps) {
  const compilationErrors = usePreviewStore((state) => state.compilationErrors);
  const compilationWarnings = usePreviewStore((state) => state.compilationWarnings);
  const runtimeErrors = usePreviewStore((state) => state.runtimeErrors);
  const runtimeWarnings = usePreviewStore((state) => state.runtimeWarnings);
  const selectedDiagnosticPath = usePreviewStore((state) => state.selectedDiagnosticPath);
  const selectDiagnosticPath = usePreviewStore((state) => state.selectDiagnosticPath);

  const hasDiagnostics =
    compilationErrors.length +
      compilationWarnings.length +
      runtimeErrors.length +
      runtimeWarnings.length >
    0;

  if (!hasDiagnostics) {
    return null;
  }

  return (
    <section aria-labelledby="sandpack-diagnostics-heading" className="space-y-4">
      <h3 id="sandpack-diagnostics-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Diagnostics
      </h3>

      <DiagnosticGroup
        title="Compilation"
        errors={compilationErrors}
        warnings={compilationWarnings}
        selectedPath={selectedDiagnosticPath}
        onSelect={(diagnostic) => {
          if (diagnostic.filePath) {
            selectDiagnosticPath(diagnostic.filePath);
            onSelectFile?.(diagnostic.filePath);
          }
        }}
      />

      <DiagnosticGroup
        title="Runtime"
        errors={runtimeErrors}
        warnings={runtimeWarnings}
        selectedPath={selectedDiagnosticPath}
        onSelect={(diagnostic) => {
          if (diagnostic.filePath) {
            selectDiagnosticPath(diagnostic.filePath);
            onSelectFile?.(diagnostic.filePath);
          }
        }}
      />
    </section>
  );
}

function DiagnosticGroup({
  title,
  errors,
  warnings,
  selectedPath,
  onSelect,
}: {
  title: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  selectedPath: string | null;
  onSelect: (diagnostic: Diagnostic) => void;
}) {
  const grouped = [...errors, ...warnings].reduce<Record<string, Diagnostic[]>>((acc, diagnostic) => {
    const key = diagnostic.filePath ?? "project";
    acc[key] = acc[key] ?? [];
    acc[key].push(diagnostic);
    return acc;
  }, {});

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <p className="text-sm font-medium text-white">
        {title}:{" "}
        <span className={errors.length > 0 ? "text-red-300" : "text-emerald-300"}>
          {errors.length > 0 ? `${errors.length} error(s)` : "No fatal errors"}
        </span>
      </p>

      <ul className="mt-3 space-y-3">
        {Object.entries(grouped).map(([filePath, diagnostics]) => (
          <li key={`${title}-${filePath}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{filePath}</p>
            <ul className="mt-1 space-y-1">
              {diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left text-sm ${
                      selectedPath === diagnostic.filePath
                        ? "bg-indigo-500/20 text-indigo-100"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                    onClick={() => onSelect(diagnostic)}
                  >
                    <span className={diagnostic.severity === "error" ? "text-red-300" : "text-amber-200"}>
                      [{diagnostic.severity}]
                    </span>{" "}
                    {diagnostic.message}
                    {diagnostic.line ? (
                      <span className="text-slate-400">
                        {" "}
                        · line {diagnostic.line}
                        {diagnostic.column ? `:${diagnostic.column}` : ""}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
