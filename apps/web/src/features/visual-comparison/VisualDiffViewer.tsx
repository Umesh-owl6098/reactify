import { useMemo } from "react";
import type { VisualComparisonResult } from "@reactify/generation-contracts";
import type { VisualDiffMode } from "./visualComparisonStore";

interface VisualDiffViewerProps {
  generationId: string;
  comparison: VisualComparisonResult;
  mode: VisualDiffMode;
  selectedRegionId: string | null;
}

function artifactUrl(generationId: string, comparisonId: string, artifactType: string): string {
  const base = import.meta.env.VITE_API_URL ?? "";
  return `${base}/api/v1/generations/${generationId}/visual-comparisons/${comparisonId}/artifacts/${artifactType}`;
}

export function VisualDiffViewer({ generationId, comparison, mode, selectedRegionId }: VisualDiffViewerProps) {
  const urls = useMemo(
    () => ({
      source: artifactUrl(generationId, comparison.comparisonId, "source"),
      preview: artifactUrl(generationId, comparison.comparisonId, "preview"),
      diff: artifactUrl(generationId, comparison.comparisonId, "diff"),
      overlay: artifactUrl(generationId, comparison.comparisonId, "overlay"),
      regions: artifactUrl(generationId, comparison.comparisonId, "regions"),
    }),
    [comparison.comparisonId, generationId],
  );

  if (mode === "side-by-side") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <ImagePane heading="Source screenshot" src={urls.source} alt="Normalized source screenshot thumbnail" />
        <ImagePane heading="Preview screenshot" src={urls.preview} alt="Captured preview screenshot thumbnail" />
      </div>
    );
  }

  if (mode === "overlay") {
    return <ImagePane heading="Overlay view" src={urls.overlay} alt="Overlay of preview with difference highlights" />;
  }

  return (
    <ImagePane
      heading={selectedRegionId ? `Diff view (${selectedRegionId})` : "Diff view"}
      src={selectedRegionId ? urls.regions : urls.diff}
      alt="Visual difference image"
    />
  );
}

function ImagePane({ heading, src, alt }: { heading: string; src: string; alt: string }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-white">{heading}</figcaption>
      <img src={src} alt={alt} className="w-full rounded-lg border border-slate-700 bg-white" />
    </figure>
  );
}
