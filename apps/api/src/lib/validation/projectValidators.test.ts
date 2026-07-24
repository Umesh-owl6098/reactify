import { describe, expect, it } from "vitest";
import { generatedProjectFixture, generationPlanFixture } from "@reactify/test-utils";
import { runSchemaProjectValidation, runStaticProjectValidation } from "./staticProjectValidator.js";

describe("project validators", () => {
  it("accepts a valid Vite React project", () => {
    const result = runStaticProjectValidation(generatedProjectFixture, generationPlanFixture);
    expect(result.valid).toBe(true);
  });

  it("fails when package.json is missing", () => {
    const project = {
      ...generatedProjectFixture,
      files: generatedProjectFixture.files.filter((file) => file.path !== "package.json"),
    };
    const result = runSchemaProjectValidation(project);
    expect(result.valid).toBe(false);
  });

  it("fails for unsafe source code", () => {
    const project = {
      ...generatedProjectFixture,
      files: generatedProjectFixture.files.map((file) =>
        file.path === "src/App.tsx" ? { ...file, content: "eval('x')" } : file,
      ),
    };
    const result = runStaticProjectValidation(project, generationPlanFixture);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "EVAL")).toBe(true);
  });

  it("returns warnings without failing when only non-critical differences exist", () => {
    const project = {
      ...generatedProjectFixture,
      files: generatedProjectFixture.files.map((file) =>
        file.path === "src/components/HeroSection.tsx"
          ? { ...file, content: file.content.replace("sm:px-8", "") }
          : file,
      ),
    };
    const result = runStaticProjectValidation(project, generationPlanFixture);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
