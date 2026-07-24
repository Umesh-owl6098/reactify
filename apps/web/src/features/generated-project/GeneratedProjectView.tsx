import type {
  GenerationStatusResponse,
  SchemaValidationResult,
  StaticValidationResult,
} from "@reactify/generation-contracts";
import { RepairStatusPanel } from "../repair/RepairStatus";
import { RepairHistory } from "../repair/RepairHistory";
import { RepairChangedFiles } from "../repair/RepairChangedFiles";
import { RepairDiagnostics } from "../repair/RepairDiagnostics";
import { useRepairStatus } from "../repair/useRepairStatus";
import { PreviewWorkspace } from "../preview/PreviewWorkspace";
import { ExportProjectPanel } from "../export/ExportProjectButton";
import { ProjectEditPanel } from "../project-edit/ProjectEditPanel";
import { VisualComparisonPanel } from "../visual-comparison/VisualComparisonPanel";
import { usePreviewStore } from "../preview/previewStore";

interface GeneratedProjectViewProps {
  status: GenerationStatusResponse;
  onValidationReportSubmitted: () => void;
  onRefreshStatus?: () => void;
}

export function GeneratedProjectView({
  status,
  onValidationReportSubmitted,
  onRefreshStatus = onValidationReportSubmitted,
}: GeneratedProjectViewProps) {
  const project = status.outputs.generatedProject;
  const phase = usePreviewStore((state) => state.phase);
  const { repair, attemptDetail, manualRetry } = useRepairStatus(status, onValidationReportSubmitted);

  if (!project) {
    return null;
  }

  return (
    <section
      className="space-y-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-5 text-left"
      aria-labelledby="generated-project-view-heading"
    >
      <div>
        <h2 id="generated-project-view-heading" className="text-lg font-semibold text-white">
          Generated source code
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Review the generated React project, browser-assisted compilation diagnostics, and live Sandpack preview.
        </p>
      </div>

      {project.warnings.length > 0 ? (
        <section aria-labelledby="generated-project-warnings-heading">
          <h3 id="generated-project-warnings-heading" className="text-sm font-semibold uppercase tracking-wide text-amber-200">
            Generation warnings
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
            {project.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <RepairStatusPanel repair={repair} onManualRetry={() => void manualRetry()} />
      <RepairHistory repair={repair} />
      <RepairChangedFiles repair={repair} attemptDetail={attemptDetail} />
      <RepairDiagnostics repair={repair} />

      <PreviewWorkspace status={status} onValidationReportSubmitted={onValidationReportSubmitted} />

      <ValidationResults
        schemaValidation={status.schemaValidation}
        staticValidation={status.staticValidation}
        sandboxValidation={status.sandboxValidation}
      />

      {status.status === "Ready" ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">
          Preview ready. Browser-assisted sandbox compilation and runtime validation succeeded.
        </div>
      ) : null}

      <ExportProjectPanel status={status} onRefreshStatus={onRefreshStatus} />
      <ProjectEditPanel status={status} onRefreshStatus={onRefreshStatus} />
      <VisualComparisonPanel status={status} onRefreshStatus={onRefreshStatus} />

      {status.status === "RepairFailed" ? (
        <div
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          role="alert"
          tabIndex={-1}
        >
          Automatic repair failed. Review the repair history and diagnostics below.
        </div>
      ) : null}

      {status.status === "RepairRequired" || phase === "repair_required" ? (
        <div
          className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="alert"
          tabIndex={-1}
        >
          Validation failed. Automatic repair will analyze diagnostics and attempt a targeted patch.
        </div>
      ) : null}
    </section>
  );
}

function ValidationResults({
  schemaValidation,
  staticValidation,
  sandboxValidation,
}: {
  schemaValidation: SchemaValidationResult | null | undefined;
  staticValidation: StaticValidationResult | null | undefined;
  sandboxValidation: GenerationStatusResponse["sandboxValidation"];
}) {
  if (!schemaValidation && !staticValidation && !sandboxValidation) {
    return null;
  }

  return (
    <section aria-labelledby="validation-results-heading" className="space-y-4">
      <h3 id="validation-results-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Validation results
      </h3>

      {schemaValidation ? (
        <ValidationPanel
          title="Schema validation"
          valid={schemaValidation.valid}
          issues={schemaValidation.errors}
        />
      ) : null}

      {staticValidation ? (
        <ValidationPanel
          title="Static validation"
          valid={staticValidation.valid}
          issues={[...staticValidation.errors, ...staticValidation.warnings]}
        />
      ) : null}

      {sandboxValidation ? (
        <ValidationPanel
          title="Sandbox validation"
          valid={sandboxValidation.compilation.success && sandboxValidation.runtime.success}
          issues={[
            ...sandboxValidation.compilation.errors,
            ...sandboxValidation.compilation.warnings,
            ...sandboxValidation.runtime.errors,
            ...sandboxValidation.runtime.warnings,
          ]}
        />
      ) : null}
    </section>
  );
}

function ValidationPanel({
  title,
  valid,
  issues,
}: {
  title: string;
  valid: boolean;
  issues: Array<{
    code: string;
    message: string;
    filePath?: string;
    severity: "error" | "warning" | "info";
    line?: number;
    column?: number;
  }>;
}) {
  const grouped = issues.reduce<Record<string, typeof issues>>((acc, issue) => {
    const key = issue.filePath ?? "project";
    acc[key] = acc[key] ?? [];
    acc[key].push(issue);
    return acc;
  }, {});

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <p className="text-sm font-medium text-white">
        {title}:{" "}
        <span className={valid ? "text-emerald-300" : "text-red-300"}>{valid ? "Passed" : "Failed"}</span>
      </p>
      {issues.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {Object.entries(grouped).map(([filePath, fileIssues]) => (
            <li key={filePath}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{filePath}</p>
              <ul className="mt-1 space-y-1">
                {fileIssues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="text-sm text-slate-300">
                    [{issue.severity}] {issue.message}
                    {issue.line ? ` · line ${issue.line}${issue.column ? `:${issue.column}` : ""}` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
