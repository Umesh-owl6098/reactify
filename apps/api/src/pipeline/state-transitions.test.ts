import { describe, expect, it } from "vitest";
import {
  assertAllowedGenerationStatusTransition,
  detectGenerationJobInconsistency,
  isAllowedGenerationStatusTransition,
} from "./state-transitions.js";

describe("generation state transitions", () => {
  it("allows valid pipeline transitions", () => {
    expect(isAllowedGenerationStatusTransition("Queued", "Analyzing")).toBe(true);
    expect(isAllowedGenerationStatusTransition("Analyzing", "Planning")).toBe(true);
    expect(isAllowedGenerationStatusTransition("Planning", "Generating")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(isAllowedGenerationStatusTransition("Analyzing", "Ready")).toBe(false);
    expect(isAllowedGenerationStatusTransition("Failed", "Analyzing")).toBe(false);
    expect(() => assertAllowedGenerationStatusTransition("Analyzing", "Ready")).toThrow();
  });

  it("detects active generation with terminal job mismatch", () => {
    expect(
      detectGenerationJobInconsistency({
        generationStatus: "Analyzing",
        awaitingPlanConfirmation: false,
        awaitingSandboxValidation: false,
        jobStatus: "failed",
      }),
    ).toBe("JOB_STALLED");
  });

  it("ignores awaiting plan confirmation", () => {
    expect(
      detectGenerationJobInconsistency({
        generationStatus: "Planning",
        awaitingPlanConfirmation: true,
        awaitingSandboxValidation: false,
        jobStatus: "completed",
      }),
    ).toBeNull();
  });
});
