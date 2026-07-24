import { USER_VISIBLE_STATUSES } from "@reactify/shared";
import type { GenerationUserStatus, GenerationStatusResponse } from "@reactify/generation-contracts";

const STATUS_LABELS: Record<GenerationUserStatus, string> = {
  Queued: "Queued",
  Uploading: "Uploading",
  Analyzing: "Analyzing",
  Planning: "Planning",
  Generating: "Generating",
  Validating: "Validating",
  Compiling: "Compiling",
  Repairing: "Repairing",
  Ready: "Ready",
  Failed: "Failed",
  Cancelled: "Cancelled",
};

interface PipelineStatusProps {
  status: GenerationStatusResponse | null;
  isPolling: boolean;
  error: string | null;
}

export function PipelineStatus({ status, isPolling, error }: PipelineStatusProps) {
  if (!status && !error) {
    return null;
  }

  const activeStatus = status?.status ?? "Queued";

  return (
    <section className="w-full max-w-2xl" aria-labelledby="pipeline-status-heading">
      <div className="mb-4 text-left">
        <h2 id="pipeline-status-heading" className="text-xl font-semibold text-white">
          Generation pipeline
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Mock pipeline progress updates every 2 seconds until completion.
        </p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2" aria-label="Pipeline status steps">
        {USER_VISIBLE_STATUSES.filter((item) => item !== "Failed" && item !== "Cancelled").map(
          (step) => {
            const stepIndex = USER_VISIBLE_STATUSES.indexOf(step);
            const activeIndex = USER_VISIBLE_STATUSES.indexOf(activeStatus);
            const isComplete = stepIndex < activeIndex || activeStatus === "Ready";
            const isActive = step === activeStatus && isPolling;

            return (
              <li
                key={step}
                className={`rounded-xl border px-4 py-3 transition-all duration-300 ${
                  isActive
                    ? "border-indigo-300 bg-indigo-500/20 shadow-lg shadow-indigo-500/20"
                    : isComplete
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-slate-700 bg-slate-900/40"
                }`}
                aria-current={isActive ? "step" : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-100">{STATUS_LABELS[step]}</span>
                  {isActive ? (
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-indigo-300" />
                  ) : null}
                </div>
              </li>
            );
          },
        )}
      </ol>

      {status ? (
        <div className="mt-6 space-y-4 rounded-2xl border border-slate-700 bg-slate-900/50 p-5 text-left">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300">
              Current status:{" "}
              <span className="font-semibold text-white">{STATUS_LABELS[activeStatus]}</span>
            </p>
            {status.activeStage ? (
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Active stage: {status.activeStage.replaceAll("_", " ")}
              </p>
            ) : null}
          </div>

          {activeStatus === "Ready" ? (
            <div className="space-y-4">
              <OutputSummary
                title="Design Analysis"
                summary={status.outputs.designAnalysis?.layoutHierarchy ?? "Unavailable"}
              />
              <OutputSummary
                title="Generation Plan"
                summary={`${status.outputs.generationPlan?.components.length ?? 0} components · ${status.outputs.generationPlan?.files.length ?? 0} files`}
              />
              <OutputSummary
                title="Generated Project"
                summary={`${status.outputs.generatedProject?.projectName ?? "Project"} · ${status.outputs.generatedProject?.files.length ?? 0} files`}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function OutputSummary({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
      <h3 className="text-sm font-semibold text-indigo-200">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{summary}</p>
    </div>
  );
}
