import { useMemo } from "react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { usePreviewReadiness } from "../preview/usePreviewReadiness";
import { resolveFeatureEligibility } from "./featureEligibility";

interface FeatureAvailabilityPanelProps {
  status: GenerationStatusResponse;
}

const FEATURE_LABELS = [
  { key: "preview", label: "Preview" },
  { key: "export", label: "Export" },
  { key: "compare", label: "Compare with original" },
  { key: "edit", label: "Edit" },
] as const;

export function FeatureAvailabilityPanel({ status }: FeatureAvailabilityPanelProps) {
  const previewReadiness = usePreviewReadiness();
  const eligibility = useMemo(
    () => resolveFeatureEligibility(status, previewReadiness),
    [status, previewReadiness],
  );

  const rows = FEATURE_LABELS.map(({ key, label }) => ({
    key,
    label,
    available:
      key === "preview"
        ? eligibility.previewAvailable
        : key === "export"
          ? eligibility.exportAvailable
          : key === "compare"
            ? eligibility.compareAvailable
            : eligibility.editAvailable,
    reason:
      key === "preview"
        ? eligibility.previewUnavailableReason
        : key === "export"
          ? eligibility.exportUnavailableReason
          : key === "compare"
            ? eligibility.compareUnavailableReason
            : eligibility.editUnavailableReason,
  }));

  return (
    <section
      className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3"
      aria-label="Feature availability"
    >
      <h3 className="text-sm font-semibold text-slate-200">Feature availability</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-slate-300">{row.label}:</span>
            {row.available ? (
              <span className="text-emerald-300">Available</span>
            ) : (
              <>
                <span className="text-amber-300">Unavailable</span>
                <span className="text-slate-400">{row.reason}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
