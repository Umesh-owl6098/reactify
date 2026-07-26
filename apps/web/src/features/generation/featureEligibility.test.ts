import { describe, expect, it } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { resolveFeatureEligibility } from "./featureEligibility";

function status(overrides: Partial<GenerationStatusResponse> = {}): GenerationStatusResponse {
  return {
    exportAllowed: true,
    exportBlockedReason: null,
    editAllowed: true,
    editBlockedReason: null,
    visualComparisonAllowed: true,
    visualComparisonBlockedReason: null,
    ...overrides,
  } as GenerationStatusResponse;
}

describe("resolveFeatureEligibility", () => {
  it("reports every capability available when nothing is blocked", () => {
    const result = resolveFeatureEligibility(status(), { ready: true, reason: null });

    expect(result.previewAvailable).toBe(true);
    expect(result.previewUnavailableReason).toBeNull();
    expect(result.exportUnavailableReason).toBeNull();
    expect(result.compareUnavailableReason).toBeNull();
    expect(result.editUnavailableReason).toBeNull();
  });

  it("keeps preview unavailability separate from export availability", () => {
    const result = resolveFeatureEligibility(status(), {
      ready: false,
      reason: "The preview rendered no visible content.",
    });

    expect(result.previewAvailable).toBe(false);
    expect(result.previewUnavailableReason).toBe("The preview rendered no visible content.");
    expect(result.exportAvailable).toBe(true);
    expect(result.exportUnavailableReason).toBeNull();
  });

  it("explains each blocked capability with its own reason", () => {
    const result = resolveFeatureEligibility(
      status({
        exportAllowed: false,
        exportBlockedReason: "export_in_progress",
        editAllowed: false,
        editBlockedReason: "edit_in_progress",
        visualComparisonAllowed: false,
        visualComparisonBlockedReason: "preview_not_ready",
      }),
      { ready: true, reason: null },
    );

    expect(result.exportUnavailableReason).toBe("An export is already being prepared.");
    expect(result.editUnavailableReason).toBe("Another edit is already being applied.");
    expect(result.compareUnavailableReason).toBe("The preview has not rendered yet, so it cannot be captured.");
  });

  it("falls back to a generic message for an unrecognised reason", () => {
    const result = resolveFeatureEligibility(
      status({ exportAllowed: false, exportBlockedReason: null }),
      { ready: true, reason: null },
    );

    expect(result.exportUnavailableReason).toBe("Export is not available right now.");
  });
});
