import { describe, expect, it } from "vitest";
import { calculateCostMicros, CostCalculatorError } from "./cost-calculator.js";

const pricing = {
  inputPerMillionMicrosUsd: 3_000_000,
  outputPerMillionMicrosUsd: 15_000_000,
};

describe("calculateCostMicros", () => {
  it("calculates input-only cost", () => {
    expect(calculateCostMicros(1_000_000, 0, pricing).inputCostMicrosUsd).toBe(3_000_000);
  });

  it("calculates output-only cost", () => {
    expect(calculateCostMicros(0, 1_000_000, pricing).outputCostMicrosUsd).toBe(15_000_000);
  });

  it("calculates combined cost with deterministic rounding", () => {
    const result = calculateCostMicros(1000, 2000, pricing);
    expect(result.totalCostMicrosUsd).toBe(result.inputCostMicrosUsd + result.outputCostMicrosUsd);
  });

  it("returns zero for zero tokens", () => {
    expect(calculateCostMicros(0, 0, pricing).totalCostMicrosUsd).toBe(0);
  });

  it("handles large token counts", () => {
    const result = calculateCostMicros(10_000_000, 5_000_000, pricing);
    expect(result.totalCostMicrosUsd).toBeGreaterThan(0);
  });

  it("rejects negative values", () => {
    expect(() => calculateCostMicros(-1, 0, pricing)).toThrow(CostCalculatorError);
  });
});
