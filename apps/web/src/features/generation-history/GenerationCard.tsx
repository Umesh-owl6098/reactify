import { Link } from "react-router-dom";
import type { GenerationSummary } from "@reactify/generation-contracts";

interface GenerationCardProps {
  generation: GenerationSummary;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function GenerationCard({ generation }: GenerationCardProps) {
  return (
    <article
      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg"
      aria-label={`Generation ${generation.generationId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Source image</p>
          <h2 className="text-lg font-semibold text-slate-100">
            {generation.sourceImageFilename ?? "Uploaded screenshot"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">Created {formatDate(generation.createdAt)}</p>
        </div>
        <span
          className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-sm text-indigo-200"
          aria-label={`Status ${generation.status}`}
        >
          {generation.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300 md:grid-cols-4">
        <div>
          <dt className="text-slate-500">Active version</dt>
          <dd>{generation.activeVersionNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Repairs</dt>
          <dd>{generation.repairCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Edits</dt>
          <dd>{generation.editCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Similarity</dt>
          <dd>
            {generation.latestSimilarityScore !== null
              ? `${generation.latestSimilarityScore.toFixed(1)}%`
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <Link
          to={`/generations/${generation.generationId}`}
          className="inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
        >
          Open Project
        </Link>
      </div>
    </article>
  );
}
