import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../auth/useSession";
import { GenerationPlanReview } from "../plan/GenerationPlanReview";
import { GeneratedProjectView } from "../generated-project/GeneratedProjectView";
import { PipelineStatus } from "../generation/PipelineStatus";
import { GenerationDetailErrorBoundary } from "../generation/GenerationDetailErrorBoundary";
import { useGeneration } from "../generation/useGeneration";
import { useJobStore, JobStatus, useGenerationJobs, useJob } from "../jobs";
import { isAwaitingPlanReview, shouldShowGeneratedProject } from "../../lib/generation-api";
import { ImagePreview } from "../upload/ImagePreview";
import { UploadZone } from "../upload/UploadZone";
import { useUploadStore } from "../upload/uploadStore";
import { GenerationWorkspaceLink } from "../generation-history/GenerationWorkspaceLink";
import { resetGenerationScopedStores, startNewGeneration } from "./startNewGeneration";
import {
  getRouteGenerationStatus,
  resolveGenerationWorkspaceView,
} from "./generation-workspace-view";
import { useGenerationStore } from "./generationStore";

interface GenerationWorkspacePageProps {
  generationId?: string;
}

interface FreshUploadLocationState {
  freshUpload?: boolean;
  imageId?: string;
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
          Back to home
        </Link>
      </div>
    </section>
  );
}

function GenerationLoadingPanel({ message }: { message: string }) {
  return (
    <section
      className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/50 px-6 py-8 text-center"
      role="status"
    >
      <p className="text-sm text-slate-200">{message}</p>
    </section>
  );
}

function GenerationWorkspaceFallback({ generationId }: { generationId: string }) {
  return (
    <section
      className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/50 px-6 py-8 text-center"
      role="status"
    >
      <h2 className="text-lg font-semibold text-white">Generation workspace</h2>
      <p className="mt-3 text-sm text-slate-300">
        Reactify is waiting for updated status for generation <span className="font-mono text-slate-200">{generationId}</span>.
      </p>
    </section>
  );
}

export function GenerationWorkspacePage({ generationId }: GenerationWorkspacePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as FreshUploadLocationState | null;
  const freshUpload = locationState?.freshUpload === true;
  const startedForImageId = useRef<string | null>(null);
  const beginGenerationLoad = useGenerationStore((state) => state.beginGenerationLoad);
  const { isAuthenticated, isInitialized } = useSession();
  const upload = useUploadStore((state) => state.upload);
  const { status, error, isLoading, isPolling, beginGeneration, loadGeneration, resumePolling, reset } =
    useGeneration();
  const activeJobId = useJobStore((state) => state.activeJobId);
  const resetJobs = useJobStore((state) => state.reset);
  const resetJobsRef = useRef(resetJobs);
  resetJobsRef.current = resetJobs;
  const { job } = useJob(activeJobId);
  useGenerationJobs(generationId ?? null);

  useLayoutEffect(() => {
    if (!generationId) {
      return;
    }

    beginGenerationLoad(generationId);
    resetJobsRef.current();
    resetGenerationScopedStores();
  }, [beginGenerationLoad, generationId]);

  useLayoutEffect(() => {
    if (!generationId || !isInitialized || !isAuthenticated) {
      return;
    }

    void loadGeneration(generationId);
  }, [generationId, isAuthenticated, isInitialized, loadGeneration]);

  useEffect(() => {
    if (generationId || !freshUpload || !upload?.imageId) {
      return;
    }

    if (startedForImageId.current === upload.imageId) {
      return;
    }

    startedForImageId.current = upload.imageId;
    void beginGeneration(upload.imageId)
      .then((id) => {
        useUploadStore.getState().clear();
        navigate(`/generations/${id}`, { replace: true });
      })
      .catch(() => {
        startedForImageId.current = null;
      });
  }, [beginGeneration, freshUpload, generationId, navigate, upload?.imageId]);

  const handleValidationReportSubmitted = useCallback(() => {
    void resumePolling();
  }, [resumePolling]);

  const handleRetried = useCallback(() => {
    if (generationId) {
      void loadGeneration(generationId);
    }
  }, [generationId, loadGeneration]);

  const view = resolveGenerationWorkspaceView({
    generationId,
    isAuthenticated,
    isInitialized,
    isLoading,
    error,
    status,
  });
  const routeStatus = getRouteGenerationStatus(status, generationId);
  const awaitingPlanReview = routeStatus ? isAwaitingPlanReview(routeStatus) : false;
  const showGeneratedProject = routeStatus ? shouldShowGeneratedProject(routeStatus) : false;

  return (
    <GenerationDetailErrorBoundary
      key={generationId ?? "new-generation"}
      generationId={generationId}
      onRetry={() => {
        if (generationId) {
          void loadGeneration(generationId);
        }
      }}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50">
        <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-center px-6 py-16">
          <div className="mb-8 flex w-full max-w-7xl items-center justify-between gap-4">
            <GenerationWorkspaceLink />
            <button
              type="button"
              onClick={() => startNewGeneration(navigate)}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              New generation
            </button>
          </div>

          {view === "upload" ? (
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

              {view === "auth-waiting" ? (
                <GenerationLoadingPanel message="Restoring your session before loading this generation…" />
              ) : null}

              {view === "loading" ? (
                <GenerationLoadingPanel message="Loading generation details…" />
              ) : null}

              {view === "error" && error ? (
                <GenerationLoadErrorPanel message={error} onRetry={() => void loadGeneration(generationId)} />
              ) : null}

              {view === "unexpected-empty" ? (
                <GenerationLoadErrorPanel
                  message="Unexpected loading error."
                  onRetry={() => void loadGeneration(generationId)}
                />
              ) : null}

              {view === "ready" && routeStatus ? (
                <div className="mt-10 w-full max-w-7xl space-y-8">
                  {awaitingPlanReview ? (
                    <GenerationPlanReview
                      status={routeStatus}
                      onConfirmed={() => {
                        void resumePolling();
                      }}
                      onCancelled={() => {
                        reset();
                        navigate("/");
                      }}
                    />
                  ) : null}
                  {showGeneratedProject ? (
                    <GeneratedProjectView
                      status={routeStatus}
                      onValidationReportSubmitted={handleValidationReportSubmitted}
                    />
                  ) : null}
                  <PipelineStatus
                    status={routeStatus}
                    isLoading={false}
                    isPolling={isPolling}
                    error={error}
                    job={job}
                    onRetried={handleRetried}
                  />
                  <div className="mt-6">
                    <JobStatus job={job} />
                  </div>
                </div>
              ) : null}

              {view === "ready" && !routeStatus ? (
                <GenerationWorkspaceFallback generationId={generationId} />
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </GenerationDetailErrorBoundary>
  );
}
