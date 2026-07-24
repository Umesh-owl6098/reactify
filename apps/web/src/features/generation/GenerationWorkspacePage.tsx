import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GenerationPlanReview } from "../plan/GenerationPlanReview";
import { GeneratedProjectView } from "../generated-project/GeneratedProjectView";
import { PipelineStatus } from "../generation/PipelineStatus";
import { GenerationDetailErrorBoundary } from "../generation/GenerationDetailErrorBoundary";
import { useGeneration } from "../generation/useGeneration";
import { JobStatus, useGenerationJobs, useJob, useJobStore } from "../jobs";
import { isAwaitingPlanReview, shouldShowGeneratedProject } from "../../lib/generation-api";
import { ImagePreview } from "../upload/ImagePreview";
import { UploadZone } from "../upload/UploadZone";
import { useUploadStore } from "../upload/uploadStore";
import { GenerationWorkspaceLink } from "../generation-history/GenerationHistoryPage";

interface GenerationWorkspacePageProps {
  generationId?: string;
}

function GenerationLoadErrorPanel({
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

function GenerationLoadingPanel() {
  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/50 px-6 py-8 text-center" role="status">
      <p className="text-sm text-slate-200">Loading generation details…</p>
      <p className="mt-2 text-xs text-slate-400">Fetching pipeline status and background job progress.</p>
    </section>
  );
}

export function GenerationWorkspacePage({ generationId }: GenerationWorkspacePageProps) {
  const navigate = useNavigate();
  const upload = useUploadStore((state) => state.upload);
  const { status, error, isLoading, isPolling, beginGeneration, loadGeneration, resumePolling, reset } =
    useGeneration();
  const activeJobId = useJobStore((state) => state.activeJobId);
  const { job } = useJob(activeJobId);
  useGenerationJobs(generationId ?? null);

  useEffect(() => {
    if (generationId) {
      void loadGeneration(generationId);
    }
  }, [generationId, loadGeneration]);

  useEffect(() => {
    if (!generationId && upload?.imageId) {
      void beginGeneration(upload.imageId).then((id) => {
        navigate(`/generations/${id}`, { replace: true });
      });
    }
  }, [generationId, upload?.imageId, beginGeneration, navigate]);

  const awaitingPlanReview = status ? isAwaitingPlanReview(status) : false;
  const showGeneratedProject = status ? shouldShowGeneratedProject(status) : false;
  const showLoading = Boolean(generationId && isLoading && !status);
  const showLoadError = Boolean(generationId && error && !status && !isLoading);
  const showUnexpectedEmpty = Boolean(generationId && !isLoading && !status && !error);

  return (
    <GenerationDetailErrorBoundary
      generationId={generationId}
      onRetry={() => {
        if (generationId) {
          void loadGeneration(generationId);
        }
      }}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50">
        <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-center px-6 py-16">
          <div className="mb-8 w-full max-w-7xl">
            <GenerationWorkspaceLink />
          </div>

          {!generationId ? (
            <>
              <div className="mb-12 text-center">
                <h1 className="mb-4 text-4xl font-bold tracking-tight">New generation</h1>
                <p className="mx-auto max-w-2xl text-lg text-slate-300">
                  Upload a screenshot to start a new Reactify project.
                </p>
              </div>
              <UploadZone />
            </>
          ) : null}

          {generationId ? (
            <>
              <div className="mt-8 w-full max-w-2xl">
                <ImagePreview />
              </div>

              {showLoading ? <GenerationLoadingPanel /> : null}
              {showLoadError && error ? (
                <GenerationLoadErrorPanel message={error} onRetry={() => void loadGeneration(generationId)} />
              ) : null}
              {showUnexpectedEmpty ? (
                <GenerationLoadErrorPanel
                  message="Unexpected loading error."
                  onRetry={() => void loadGeneration(generationId)}
                />
              ) : null}

              {!showLoading && !showLoadError && !showUnexpectedEmpty ? (
                <div className="mt-10 w-full max-w-7xl">
                  {awaitingPlanReview && status ? (
                    <GenerationPlanReview
                      status={status}
                      onConfirmed={() => {
                        void resumePolling();
                      }}
                      onCancelled={() => {
                        reset();
                        navigate("/");
                      }}
                    />
                  ) : null}
                  {showGeneratedProject && status ? (
                    <GeneratedProjectView
                      status={status}
                      onValidationReportSubmitted={() => {
                        void resumePolling();
                      }}
                    />
                  ) : null}
          <PipelineStatus
            status={status}
            isLoading={isLoading}
            isPolling={isPolling}
            error={error}
            job={job}
            onRetried={() => {
              if (generationId) {
                void loadGeneration(generationId);
              }
            }}
          />
                  <div className="mt-6">
                    <JobStatus job={job} />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </GenerationDetailErrorBoundary>
  );
}
