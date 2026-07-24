import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GenerationPlanReview } from "../plan/GenerationPlanReview";
import { GeneratedProjectView } from "../generated-project/GeneratedProjectView";
import { PipelineStatus } from "../generation/PipelineStatus";
import { useGeneration } from "../generation/useGeneration";
import { isAwaitingPlanReview, shouldShowGeneratedProject } from "../../lib/generation-api";
import { ImagePreview } from "../upload/ImagePreview";
import { UploadZone } from "../upload/UploadZone";
import { useUploadStore } from "../upload/uploadStore";
import { GenerationWorkspaceLink } from "../generation-history/GenerationHistoryPage";

interface GenerationWorkspacePageProps {
  generationId?: string;
}

export function GenerationWorkspacePage({ generationId }: GenerationWorkspacePageProps) {
  const navigate = useNavigate();
  const upload = useUploadStore((state) => state.upload);
  const { status, error, isPolling, beginGeneration, loadGeneration, resumePolling, reset } =
    useGeneration();

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

  return (
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

        <div className="mt-8 w-full max-w-2xl">
          <ImagePreview />
        </div>
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
          <PipelineStatus status={status} isPolling={isPolling} error={error} />
        </div>
      </main>
    </div>
  );
}
