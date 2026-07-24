import type { GenerationSummary } from "@reactify/generation-contracts";
import { GenerationCard } from "./GenerationCard";
import { GenerationEmptyState } from "./GenerationEmptyState";

interface GenerationListProps {
  items: GenerationSummary[];
  isLoading: boolean;
  error: string | null;
}

export function GenerationList({ items, isLoading, error }: GenerationListProps) {
  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200" role="alert">
        {error}
      </div>
    );
  }

  if (isLoading && items.length === 0) {
    return <p className="text-slate-300">Loading generation history…</p>;
  }

  if (items.length === 0) {
    return <GenerationEmptyState />;
  }

  return (
    <div className="grid gap-4">
      {items.map((generation) => (
        <GenerationCard key={generation.generationId} generation={generation} />
      ))}
    </div>
  );
}
