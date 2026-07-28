import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { APP_VERSION } from "@reactify/shared";
import { UploadZone } from "../upload/UploadZone";
import { useUploadStore } from "../upload/uploadStore";
import { resetActiveGenerationSession } from "../generation/startNewGeneration";
import { GenerationFilters } from "./GenerationFilters";
import { GenerationList } from "./GenerationList";
import { useGenerationHistory } from "./useGenerationHistory";

export function GenerationHistoryPage() {
  const navigate = useNavigate();
  const uploadStatus = useUploadStore((state) => state.status);
  const upload = useUploadStore((state) => state.upload);
  const { items, total, limit, offset, statusFilter, isLoading, error, setPagination, setStatusFilter } =
    useGenerationHistory();

  useEffect(() => {
    if (!isLoading && total === 0 && !error) {
      navigate("/generations/new", { replace: true });
    }
  }, [error, isLoading, navigate, total]);

  useEffect(() => {
    resetActiveGenerationSession();
  }, []);

  useEffect(() => {
    if (uploadStatus === "success" && upload?.imageId) {
      navigate("/generations/new", {
        replace: true,
        state: { freshUpload: true, imageId: upload.imageId },
      });
    }
  }, [navigate, upload?.imageId, uploadStatus]);

  const canGoPrev = offset > 0;
  const canGoNext = offset + limit < total;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-16">
        <div className="mb-10 text-center">
          <p className="mb-4 inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1 text-sm font-medium text-indigo-200">
            Foundation v{APP_VERSION}
          </p>
          <h1 className="mb-3 text-4xl font-bold tracking-tight sm:text-5xl">Reactify</h1>
          <p className="mx-auto max-w-2xl text-slate-300">
            Upload a new screenshot to start fresh. Open past projects from history below.
          </p>
        </div>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Start a new generation</h2>
          <UploadZone />
        </section>

        <section aria-label="Generation history">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Project history</h2>
            <GenerationFilters statusFilter={statusFilter} onStatusChange={setStatusFilter} />
          </div>

          <GenerationList items={items} isLoading={isLoading} error={error} />

          {total > limit ? (
            <div className="mt-6 flex items-center justify-between text-sm text-slate-300">
              <span>
                Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canGoPrev}
                  onClick={() => setPagination(limit, Math.max(offset - limit, 0))}
                  className="rounded-lg border border-slate-700 px-3 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => setPagination(limit, offset + limit)}
                  className="rounded-lg border border-slate-700 px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <p className="mt-10 text-center text-sm text-slate-500">
          Open an existing project from history or upload a new screenshot above.
        </p>
      </main>
    </div>
  );
}
