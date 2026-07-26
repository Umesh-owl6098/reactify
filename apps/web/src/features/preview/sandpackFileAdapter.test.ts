import { describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { getSandpackDependencies, toSandpackFiles } from "./sandpackFileAdapter";

describe("sandpackFileAdapter", () => {
  it("substitutes compiled Tailwind CSS for Sandpack preview stylesheet", () => {
    const compiledStylesheet = ".grid{display:grid}.p-6{padding:1.5rem}";
    const files = toSandpackFiles(generatedProjectFixture, { compiledStylesheet });

    expect(files["/src/index.css"]).toMatchObject({
      code: compiledStylesheet,
    });
  });

  it("converts generated project files with normalized paths", () => {
    const files = toSandpackFiles(generatedProjectFixture, { activePath: "src/App.tsx" });

    expect(files["/src/App.tsx"]).toMatchObject({
      code: expect.stringContaining("HeroSection"),
      active: true,
    });
    expect(files["/package.json"]).toBeTruthy();
    expect(files["/.env"]).toBeUndefined();
  });

  it("includes only Sandpack runtime dependencies", () => {
    const dependencies = getSandpackDependencies(generatedProjectFixture);
    expect(dependencies.react).toBe(generatedProjectFixture.dependencies.react);
    expect(dependencies["react-dom"]).toBe(generatedProjectFixture.dependencies["react-dom"]);
    expect(dependencies.vite).toBeUndefined();
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
