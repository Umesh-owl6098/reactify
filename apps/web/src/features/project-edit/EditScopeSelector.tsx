import type { GeneratedProjectSummary } from "@reactify/generation-contracts";

interface EditScopeSelectorProps {
  project: GeneratedProjectSummary;
  selectedFiles: string[];
  selectedComponentIds: string[];
  onToggleFile: (path: string) => void;
  onToggleComponent: (componentId: string) => void;
}

export function EditScopeSelector({
  project,
  selectedFiles,
  selectedComponentIds,
  onToggleFile,
  onToggleComponent,
}: EditScopeSelectorProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <fieldset className="rounded-lg border border-slate-700 p-3">
        <legend className="px-1 text-sm font-medium text-slate-200">Optional file scope</legend>
        <ul className="mt-2 max-h-40 space-y-2 overflow-auto text-sm">
          {project.files.map((file) => (
            <li key={file.path}>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(file.path)}
                  onChange={() => onToggleFile(file.path)}
                />
                <span>{file.path}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-700 p-3">
        <legend className="px-1 text-sm font-medium text-slate-200">Optional component scope</legend>
        <ul className="mt-2 max-h-40 space-y-2 overflow-auto text-sm">
          {project.components.map((component) => (
            <li key={component.name}>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedComponentIds.includes(component.name)}
                  onChange={() => onToggleComponent(component.name)}
                />
                <span>{component.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
