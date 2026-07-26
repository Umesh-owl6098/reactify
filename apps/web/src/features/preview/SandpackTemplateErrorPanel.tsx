import type { SandpackTemplateResolutionError } from "./resolveSandpackTemplate";

interface SandpackTemplateErrorPanelProps {
  errors: SandpackTemplateResolutionError[];
}

export function SandpackTemplateErrorPanel({ errors }: SandpackTemplateErrorPanelProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
      <p className="font-medium">Preview configuration error</p>
      <p className="mt-1 text-red-200">
        The generated project cannot be mapped onto a supported Sandpack configuration, so no preview was started.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={`${error.code}-${error.message}`}>{error.message}</li>
        ))}
      </ul>
    </div>
  );
}
