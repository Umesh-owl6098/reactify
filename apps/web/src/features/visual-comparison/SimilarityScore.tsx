interface SimilarityScoreProps {
  similarity: number;
  pixelDifference: number;
  structuralDifference: number;
}

export function SimilarityScore({ similarity, pixelDifference, structuralDifference }: SimilarityScoreProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Visual comparison scores">
      <ScoreCard label="Overall similarity" value={`${similarity.toFixed(1)}%`} tone="emerald" />
      <ScoreCard label="Changed pixels" value={`${pixelDifference.toFixed(1)}%`} tone="amber" />
      <ScoreCard label="Structural difference" value={`${structuralDifference.toFixed(1)}`} tone="rose" />
    </div>
  );
}

function ScoreCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald" ? "text-emerald-200" : tone === "amber" ? "text-amber-200" : "text-rose-200";
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
