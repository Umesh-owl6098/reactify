import { describe, expect, it } from "vitest";
import type { VisualComparisonResult } from "@reactify/generation-contracts";
import { describeMissingMetrics, formatMetricPercentage, hasRealMetrics } from "./comparisonMetrics";

function buildComparison(overrides: Partial<VisualComparisonResult>): VisualComparisonResult {
  return {
    comparisonId: "11111111-1111-4111-8111-111111111111",
    generationId: "22222222-2222-4222-8222-222222222222",
    versionId: "v1",
    projectHash: "hash",
    status: "completed",
    viewport: { width: 1440, height: 800, deviceScaleFactor: 1 },
    overallSimilarityScore: 0,
    pixelDifferencePercentage: 0,
    structuralDifferenceScore: 0,
    regions: [],
    summary: "",
    correctionRecommended: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as VisualComparisonResult;
}

describe("comparison metrics presentation", () => {
  it("reports real metrics for a completed comparison", () => {
    const comparison = buildComparison({ status: "completed", overallSimilarityScore: 82.37 });
    expect(hasRealMetrics(comparison)).toBe(true);
    expect(formatMetricPercentage(comparison, comparison.overallSimilarityScore)).toBe("82.4%");
    expect(describeMissingMetrics(comparison)).toBeNull();
  });

  it("never presents a failed capture as a real 0% measurement", () => {
    const comparison = buildComparison({
      status: "failed",
      failureReason: "Preview screenshot capture timed out.",
    });

    expect(hasRealMetrics(comparison)).toBe(false);
    expect(formatMetricPercentage(comparison, comparison.overallSimilarityScore)).toBe("—");
    expect(formatMetricPercentage(comparison, comparison.pixelDifferencePercentage)).toBe("—");
    expect(describeMissingMetrics(comparison)).toBe("Preview screenshot capture timed out.");
  });

  it("explains a comparison still awaiting capture", () => {
    const comparison = buildComparison({ status: "awaiting_capture" });
    expect(formatMetricPercentage(comparison, 0)).toBe("—");
    expect(describeMissingMetrics(comparison)).toBe("Waiting for a preview screenshot.");
  });

  it("treats a correction_available comparison as measured", () => {
    const comparison = buildComparison({ status: "correction_available", pixelDifferencePercentage: 12.5 });
    expect(formatMetricPercentage(comparison, comparison.pixelDifferencePercentage)).toBe("12.5%");
  });
});
