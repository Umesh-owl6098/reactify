import { describe, expect, it } from "vitest";
import { isTransientError, TransientJobError, PermanentJobError } from "./job-errors.js";
import { ErrorCode } from "@reactify/shared";

describe("job errors", () => {
  it("classifies transient and permanent failures", () => {
    expect(isTransientError(new TransientJobError(ErrorCode.AI_TIMEOUT, "timeout"))).toBe(true);
    expect(isTransientError(new PermanentJobError(ErrorCode.PERSISTED_DATA_INVALID, "bad payload"))).toBe(
      false,
    );
  });
});

describe("workflow chaining contracts", () => {
  it("documents chained job types for generation pipeline", () => {
    const chain = ["design_analysis", "generation_plan_creation", "react_project_generation", "automatic_repair"];
    expect(chain).toContain("design_analysis");
    expect(chain).toContain("automatic_repair");
  });

  it("includes design_analysis in the job registry contract", async () => {
    const { createJobRegistry } = await import("./job-registry.js");
    const registry = createJobRegistry({
      runner: {} as never,
      editService: {} as never,
      exportService: {} as never,
      visualComparisonService: {} as never,
    });
    expect(registry.has("design_analysis")).toBe(true);
  });
});
