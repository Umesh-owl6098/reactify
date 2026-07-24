import { useEffect } from "react";
import { APP_VERSION } from "@reactify/shared";
import { GenerationPlanReview } from "../features/plan/GenerationPlanReview";
import { PipelineStatus } from "../features/generation/PipelineStatus";
import { useGeneration } from "../features/generation/useGeneration";
import { isAwaitingPlanReview } from "../lib/generation-api";
import { ImagePreview } from "../features/upload/ImagePreview";
import { UploadZone } from "../features/upload/UploadZone";
import { useUploadStore } from "../features/upload/uploadStore";

export function App() {
  const upload = useUploadStore((state) => state.upload);
  const { status, error, isPolling, beginGeneration, resumePolling, reset } = useGeneration();

  useEffect(() => {
    if (upload?.imageId) {
      void beginGeneration(upload.imageId);
    }
  }, [upload?.imageId, beginGeneration]);

  const awaitingPlanReview = status ? isAwaitingPlanReview(status) : false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center px-6 py-16">
        <div className="mb-12 text-center">
          <p className="mb-4 inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1 text-sm font-medium text-indigo-200">
            Foundation v{APP_VERSION}
          </p>
          <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">Reactify</h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-300">
            Turn UI screenshots into production-ready React applications with a validated,
            AI-assisted workflow.
          </p>
        </div>

        <UploadZone />
        <div className="mt-8 w-full max-w-2xl">
          <ImagePreview />
        </div>
        <div className="mt-10 w-full max-w-2xl">
          {awaitingPlanReview && status ? (
            <GenerationPlanReview
              status={status}
              onConfirmed={() => {
                void resumePolling();
              }}
              onCancelled={reset}
            />
          ) : null}
          <PipelineStatus status={status} isPolling={isPolling} error={error} />
        </div>
      </main>
    </div>
  );
}
