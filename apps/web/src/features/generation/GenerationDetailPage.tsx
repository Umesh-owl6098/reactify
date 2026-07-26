import { useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { fetchGenerationStatus, mapGenerationLoadError } from "../../lib/generation-api";
import { GenerationDetailErrorBoundary } from "./GenerationDetailErrorBoundary";
import { PipelineStatus } from "./PipelineStatus";
import { GenerationWorkspaceLink } from "../generation-history/GenerationWorkspaceLink";

interface GenerationDetailPageProps {
  generationId: string;
}

function GenerationLoadingPanel() {
  return (
    <section
      className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/50 px-6 py-8 text-center"
      role="status"
    >
      <p className="text-sm text-slate-200">Loading generation details…</p>
      <p className="mt-2 text-xs text-slate-400">Fetching pipeline status for this project.</p>
    </section>
  );
}

function GenerationErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section
      className="mx-auto w-full max-w-2xl rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-8 text-center"
      role="alert"
    >
      <h2 className="text-lg font-semibold text-red-100">Unable to load generation</h2>
      <p className="mt-3 text-sm text-red-200">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
        >
          Retry
        </button>
        <Link
          to="/"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          Back to history
        </Link>
      </div>
    </section>
  );
}

function GenerationSummaryPanel({ generation }: { generation: GenerationStatusResponse }) {
  const latestError = generation.errors?.at(-1);

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/50 px-6 py-6 text-left">
      <h2 className="text-lg font-semibold text-white">Generation {generation.id}</h2>
      <dl className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
        <div>
          <dt className="text-slate-400">Status</dt>
          <dd className="font-medium">{generation.status}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Active stage</dt>
          <dd className="font-medium">{generation.activeStage ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Failure code</dt>
          <dd className="font-medium">{latestError?.code ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Retry allowed</dt>
          <dd className="font-medium">{generation.retryAllowed ? "Yes" : "No"}</dd>
        </div>
      </dl>
    </section>
  );
}

export function GenerationDetailPage({ generationId }: GenerationDetailPageProps) {
  const [generation, setGeneration] = useState<GenerationStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useLayoutEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setGeneration(null);
    setError(null);

    void fetchGenerationStatus(generationId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setGeneration(response);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(mapGenerationLoadError(loadError, "This generation is unavailable or may have been deleted."));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [generationId, reloadToken]);

  const retry = () => setReloadToken((value) => value + 1);

  return (
    <GenerationDetailErrorBoundary generationId={generationId} onRetry={retry}>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50">
        <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-center px-6 py-16">
          <div className="mb-8 w-full max-w-7xl">
            <GenerationWorkspaceLink />
          </div>

          <div className="w-full max-w-7xl space-y-8">
            {isLoading ? <GenerationLoadingPanel /> : null}
            {!isLoading && error ? <GenerationErrorPanel message={error} onRetry={retry} /> : null}
            {!isLoading && !error && !generation ? (
              <GenerationErrorPanel message="Unexpected empty generation state." onRetry={retry} />
            ) : null}
            {!isLoading && !error && generation ? (
              <>
                <GenerationSummaryPanel generation={generation} />
                <PipelineStatus
                  status={generation}
                  isLoading={false}
                  isPolling={generation.status === "Analyzing"}
                  error={null}
                  job={null}
                  onRetried={retry}
                />
              </>
            ) : null}
          </div>
        </main>
      </div>
    </GenerationDetailErrorBoundary>
  );
}
