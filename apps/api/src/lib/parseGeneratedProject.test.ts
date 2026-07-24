import { describe, expect, it } from "vitest";
import { createGeneratedProjectFixtureJson, generatedProjectFixture } from "@reactify/test-utils";
import { parseGeneratedProjectResponse } from "./parseGeneratedProject.js";
import { ErrorCode } from "@reactify/shared";
import { generationPlanFixture } from "@reactify/test-utils";

describe("parseGeneratedProjectResponse", () => {
  it("parses a valid generated project", () => {
    const result = parseGeneratedProjectResponse(createGeneratedProjectFixtureJson(), generationPlanFixture);
    expect(result.ok).toBe(true);
  });

  it("returns PLAN_PROJECT_MISMATCH when planned files are missing", () => {
    const result = parseGeneratedProjectResponse(
      createGeneratedProjectFixtureJson({
        files: generatedProjectFixture.files.filter((file) => file.path !== "src/components/HeroSection.tsx"),
      }),
      generationPlanFixture,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.PLAN_PROJECT_MISMATCH);
    }
  });
});
