import { describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { getSandpackDependencies, toSandpackFiles } from "./sandpackFileAdapter";

describe("sandpackFileAdapter", () => {
  it("converts generated project files with normalized paths", () => {
    const files = toSandpackFiles(generatedProjectFixture, { activePath: "src/App.tsx" });

    expect(files["/src/App.tsx"]).toMatchObject({
      code: expect.stringContaining("HeroSection"),
      active: true,
    });
    expect(files["/package.json"]).toBeTruthy();
    expect(files["/.env"]).toBeUndefined();
  });

  it("preserves package.json and dependencies without modification", () => {
    const dependencies = getSandpackDependencies(generatedProjectFixture);
    expect(dependencies.react).toBe(generatedProjectFixture.dependencies.react);
    expect(dependencies.vite).toBe(generatedProjectFixture.devDependencies?.vite);
    expect(dependencies.express).toBeUndefined();
  });

  it("filters unsupported environment files safely", () => {
    const project = {
      ...generatedProjectFixture,
      files: [
        ...generatedProjectFixture.files,
        {
          path: ".env",
          language: "json" as const,
          purpose: "secrets",
          content: "ANTHROPIC_API_KEY=secret",
        },
      ],
    };

    const files = toSandpackFiles(project);
    expect(files["/.env"]).toBeUndefined();
    expect(Object.keys(files).every((path) => !path.includes(".env"))).toBe(true);
  });
});
