import { USER_VISIBLE_STATUSES } from "@reactify/shared";
import type {
  AnalysisMetadata,
  DesignAnalysisV1,
  GenerationUserStatus,
  GenerationStatusResponse,
} from "@reactify/generation-contracts";

const STATUS_LABELS: Record<GenerationUserStatus, string> = {
  Queued: "Queued",
  Uploading: "Uploading",
  Analyzing: "Analyzing design",
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
  const analysisError = status?.errors.find((entry) => entry.stage === "design_analysis");
  const designAnalysis = status?.outputs.designAnalysis;
  const analysisMetadata = status?.analysis;
  const isPlanningReview = status?.status === "Planning" && status.awaitingPlanConfirmation;
  const isAnalyzing = activeStatus === "Analyzing" && isPolling;
  const analysisCompleted = Boolean(designAnalysis && analysisMetadata);
  const analysisFailed = Boolean(analysisError);

  return (
    <section className="w-full max-w-3xl" aria-labelledby="pipeline-status-heading">
      <div className="mb-4 text-left">
        <h2 id="pipeline-status-heading" className="text-xl font-semibold text-white">
          Generation pipeline
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Upload validation and design analysis run against the screenshot. Later stages still use
          deterministic fixtures.
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

          {isPlanningReview ? (
            <StatusBanner tone="info" title="Awaiting plan confirmation">
              Review the generated plan and confirm before mocked code generation continues.
            </StatusBanner>
          ) : null}

          {isAnalyzing ? (
            <StatusBanner tone="info" title="Analyzing screenshot">
              Claude is extracting layout, tokens, and component hierarchy from your upload.
            </StatusBanner>
          ) : null}

          {analysisFailed ? (
            <AnalysisFailureBanner error={analysisError!} />
          ) : null}

          {analysisCompleted ? (
            <DesignAnalysisPanel
              designAnalysis={designAnalysis!}
              metadata={analysisMetadata!}
            />
          ) : null}

          {activeStatus === "Ready" ? (
            <div className="space-y-4 border-t border-slate-700 pt-4">
              <OutputSummary
                title="Generation Plan (mock)"
                summary={`${status.outputs.generationPlan?.components.length ?? 0} components · ${status.outputs.generationPlan?.files.length ?? 0} files`}
              />
              <OutputSummary
                title="Generated Project (mock)"
                summary={`${status.outputs.generatedProject?.projectName ?? "Project"} · ${status.outputs.generatedProject?.files.length ?? 0} files`}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function AnalysisFailureBanner({
  error,
}: {
  error: GenerationStatusResponse["errors"][number];
}) {
  const title = getAnalysisFailureTitle(error.code);

  return (
    <StatusBanner tone="error" title={title}>
      {error.message}
    </StatusBanner>
  );
}

function getAnalysisFailureTitle(code: string): string {
  switch (code) {
    case "AI_TIMEOUT":
      return "Provider timeout";
    case "AI_RESPONSE_VERSION_MISSING":
      return "Malformed AI response";
    case "ANALYSIS_SCHEMA_INVALID":
      return "Invalid design analysis schema";
    case "AI_ERROR":
      return "Analysis failed";
    case "IMAGE_NOT_FOUND":
      return "Image not found";
    default:
      return "Design analysis failed";
  }
}

function DesignAnalysisPanel({
  designAnalysis,
  metadata,
}: {
  designAnalysis: DesignAnalysisV1;
  metadata: AnalysisMetadata;
}) {
  return (
    <div className="space-y-5 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-emerald-200">Design analysis completed</h3>
          <p className="mt-1 text-sm text-slate-300">{designAnalysis.layoutHierarchy}</p>
        </div>
        <MetadataSummary metadata={metadata} />
      </div>

      {designAnalysis.componentHierarchy.length > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Detected components
          </h4>
          <ul className="mt-2 space-y-2">
            {designAnalysis.componentHierarchy.map((component) => (
              <li
                key={component.id}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
              >
                <span className="font-medium text-white">{component.type}</span>
                <span className="text-slate-400"> · {component.id}</span>
                <p className="mt-1 text-slate-300">{component.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {designAnalysis.colors.length > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Color tokens
          </h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {designAnalysis.colors.map((color) => (
              <li
                key={`${color.name}-${color.hex}`}
                className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2"
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-md border border-white/10"
                  style={{ backgroundColor: color.hex }}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-white">{color.name}</p>
                  <p className="text-xs text-slate-400">{color.hex}</p>
                  {color.usage ? <p className="text-xs text-slate-500">{color.usage}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {designAnalysis.typography.length > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Typography tokens
          </h4>
          <ul className="mt-2 space-y-2">
            {designAnalysis.typography.map((token) => (
              <li
                key={`${token.element}-${token.fontSize}`}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
              >
                <span className="font-medium text-white">{token.element}</span>
                <p className="mt-1 text-slate-300">
                  {token.fontFamily} · {token.fontSize} · {token.fontWeight}
                  {token.lineHeight ? ` · lh ${token.lineHeight}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {designAnalysis.spacing.length > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Spacing tokens
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {designAnalysis.spacing.map((token) => (
              <li
                key={`${token.name}-${token.value}`}
                className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-200"
              >
                {token.name}: {token.value}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {designAnalysis.responsiveBehavior ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Responsive behavior
          </h4>
          <p className="mt-2 text-sm text-slate-300">{designAnalysis.responsiveBehavior}</p>
        </section>
      ) : null}
    </div>
  );
}

function MetadataSummary({ metadata }: { metadata: AnalysisMetadata }) {
  return (
    <dl className="grid gap-1 text-right text-xs text-slate-400">
      <div>
        <dt className="inline">Provider: </dt>
        <dd className="inline text-slate-200">
          {metadata.provider} · {metadata.model}
        </dd>
      </div>
      <div>
        <dt className="inline">Tokens: </dt>
        <dd className="inline text-slate-200">
          {metadata.inputTokens} in / {metadata.outputTokens} out
        </dd>
      </div>
      <div>
        <dt className="inline">Latency: </dt>
        <dd className="inline text-slate-200">{metadata.latencyMs} ms</dd>
      </div>
      <div>
        <dt className="inline">Prompt: </dt>
        <dd className="inline text-slate-200">v{metadata.promptVersion}</dd>
      </div>
    </dl>
  );
}

function StatusBanner({
  tone,
  title,
  children,
}: {
  tone: "info" | "error";
  title: string;
  children: string;
}) {
  const classes =
    tone === "error"
      ? "border-red-400/30 bg-red-500/10 text-red-200"
      : "border-indigo-400/30 bg-indigo-500/10 text-indigo-100";

  return (
    <div className={`rounded-xl border px-4 py-3 ${classes}`} role="status">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{children}</p>
    </div>
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
