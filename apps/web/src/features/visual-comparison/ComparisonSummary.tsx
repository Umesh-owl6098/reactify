import type { VisualComparisonResult, VisualRegionDifference } from "@reactify/generation-contracts";

interface DifferenceRegionListProps {
  regions: VisualRegionDifference[];
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
}

export function DifferenceRegionList({ regions, selectedRegionId, onSelectRegion }: DifferenceRegionListProps) {
  if (regions.length === 0) {
    return <p className="text-sm text-slate-400">No notable difference regions detected.</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Detected visual difference regions">
      {regions.map((region) => (
        <li key={region.regionId}>
          <button
            type="button"
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
              selectedRegionId === region.regionId
                ? "border-indigo-400 bg-indigo-500/10 text-white"
                : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
            }`}
            aria-pressed={selectedRegionId === region.regionId}
            onClick={() => onSelectRegion(region.regionId)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{region.regionId}</span>
              <SeverityBadge severity={region.severity} />
            </div>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{region.likelyCategory} (heuristic)</p>
            <p className="mt-1 text-slate-300">{region.description}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SeverityBadge({ severity }: { severity: VisualRegionDifference["severity"] }) {
  const label = severity === "high" ? "High severity" : severity === "medium" ? "Medium severity" : "Low severity";
  const className =
    severity === "high"
      ? "bg-rose-500/20 text-rose-100"
      : severity === "medium"
        ? "bg-amber-500/20 text-amber-100"
        : "bg-slate-500/20 text-slate-100";
  return <span className={`rounded px-2 py-0.5 text-xs ${className}`}>{label}</span>;
}

export function ComparisonSummary({ comparison }: { comparison: VisualComparisonResult }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200">
      <p>{comparison.summary}</p>
      <p className="mt-2 text-xs text-slate-400">
        Viewport {comparison.viewport.width}×{comparison.viewport.height} · Version compared: {comparison.versionId.slice(0, 12)}…
      </p>
      {comparison.improvementOutcome ? (
        <p className="mt-2 font-medium text-indigo-200" role="status">
          Correction outcome: {comparison.improvementOutcome}
        </p>
      ) : null}
    </div>
  );
}
