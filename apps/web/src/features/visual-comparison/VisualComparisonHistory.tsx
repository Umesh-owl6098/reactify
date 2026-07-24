import type { VisualComparisonResult } from "@reactify/generation-contracts";

interface VisualComparisonHistoryProps {
  comparisons: VisualComparisonResult[];
}

export function VisualComparisonHistory({ comparisons }: VisualComparisonHistoryProps) {
  if (comparisons.length === 0) {
    return <p className="text-sm text-slate-400">No visual comparisons yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm text-slate-200">
        <caption className="sr-only">Visual comparison history</caption>
        <thead className="text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2">Comparison</th>
            <th className="px-3 py-2">Viewport</th>
            <th className="px-3 py-2">Similarity</th>
            <th className="px-3 py-2">Changed pixels</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((comparison) => (
            <tr key={comparison.comparisonId} className="border-t border-slate-800">
              <td className="px-3 py-2 font-mono text-xs">{comparison.comparisonId.slice(0, 8)}…</td>
              <td className="px-3 py-2">
                {comparison.viewport.width}×{comparison.viewport.height}
              </td>
              <td className="px-3 py-2">{comparison.overallSimilarityScore.toFixed(1)}%</td>
              <td className="px-3 py-2">{comparison.pixelDifferencePercentage.toFixed(1)}%</td>
              <td className="px-3 py-2 capitalize">{comparison.status.replaceAll("_", " ")}</td>
              <td className="px-3 py-2 capitalize">{comparison.improvementOutcome ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
