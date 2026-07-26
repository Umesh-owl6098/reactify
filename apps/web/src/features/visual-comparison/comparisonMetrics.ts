import type { VisualComparisonResult } from "@reactify/generation-contracts";

/**
 * Only a comparison that actually ran the diff has metrics. Every other status
 * carries the zero-initialised values the record was created with, and showing
 * those as "0.0% similar / 0.0% changed" reads like a real measurement of a
 * totally different design rather than a comparison that never happened.
 */
const STATUSES_WITH_METRICS = new Set<VisualComparisonResult["status"]>([
  "completed",
  "correction_available",
]);

export function hasRealMetrics(comparison: VisualComparisonResult): boolean {
  return STATUSES_WITH_METRICS.has(comparison.status);
}

export function formatMetricPercentage(
  comparison: VisualComparisonResult,
  value: number,
  placeholder = "—",
): string {
  return hasRealMetrics(comparison) ? `${value.toFixed(1)}%` : placeholder;
}

/** Short, human readable explanation for a comparison without metrics. */
export function describeMissingMetrics(comparison: VisualComparisonResult): string | null {
  if (hasRealMetrics(comparison)) {
    return null;
  }

  if (comparison.status === "failed") {
    return comparison.failureReason ?? "Comparison failed before any pixels were compared.";
  }

  if (comparison.status === "awaiting_capture") {
    return "Waiting for a preview screenshot.";
  }

  if (comparison.status === "awaiting_revalidation") {
    return "Waiting for the corrected project to be revalidated.";
  }

  return "Comparison is still running.";
}
