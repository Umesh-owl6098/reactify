import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { createGenerationPlanFixtureJson } from "@reactify/test-utils";
import { parseGenerationPlanResponse } from "./parseGenerationPlan.js";

describe("parseGenerationPlanResponse", () => {
  it("parses a valid GenerationPlanV1 response", () => {
    const result = parseGenerationPlanResponse(createGenerationPlanFixtureJson());
    expect(result.ok).toBe(true);
  });

  it("returns AI_RESPONSE_VERSION_MISSING when schemaVersion is absent", () => {
    const result = parseGenerationPlanResponse(
      JSON.stringify({
        responseVersion: "2026-01-01T00:00:00.000Z",
        components: [],
        files: [],
        designTokens: { colors: {}, typography: {}, spacing: {} },
        dependencies: { react: "^18.3.1" },
        responsiveStrategy: "x",
        accessibilityStrategy: "y",
        confidenceWarnings: [],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.AI_RESPONSE_VERSION_MISSING);
    }
  });
});
