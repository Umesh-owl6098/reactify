import type { GeneratedProjectSummary } from "@reactify/generation-contracts";

interface GeneratedProjectSummaryProps {
  project: GeneratedProjectSummary;
}

export function GeneratedProjectSummaryPanel({ project }: GeneratedProjectSummaryProps) {
  return (
    <section aria-labelledby="generated-project-summary-heading" className="space-y-3">
      <div>
        <h3 id="generated-project-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Generated project
        </h3>
        <p className="mt-1 text-lg font-semibold text-white">{project.projectName}</p>
        <p className="mt-1 text-sm text-slate-300">{project.summary}</p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Files" value={String(project.files.length)} />
        <Metric label="Components" value={String(project.components.length)} />
        <Metric
          label="Dependencies"
          value={String(
            Object.keys(project.dependencies).length + Object.keys(project.devDependencies ?? {}).length,
          )}
        />
        <Metric label="Warnings" value={String(project.warnings.length)} />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-white">{value}</dd>
    </div>
  );
}
