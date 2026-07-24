import { describe, expect, it } from "vitest";
import { generatedProjectFixture, generationPlanFixture } from "@reactify/test-utils";
import { runSchemaProjectValidation, runStaticProjectValidation } from "./staticProjectValidator.js";

describe("fixture validation", () => {
  it("passes schema and static validation", () => {
    const schema = runSchemaProjectValidation(generatedProjectFixture);
    const staticResult = runStaticProjectValidation(generatedProjectFixture, generationPlanFixture);

    expect(schema.errors).toEqual([]);
    expect(staticResult.errors).toEqual([]);
    expect(staticResult.valid).toBe(true);
  });
});
