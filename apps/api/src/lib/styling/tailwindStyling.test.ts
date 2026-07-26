import { describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { compileTailwindCss, cssContainsUtilityRules } from "./compileTailwindCss.js";
import { normalizeProjectStyling } from "./normalizeProjectStyling.js";
import { validateTailwindSetup, detectVerticalStackLayoutMismatch } from "./tailwindValidator.js";

describe("normalizeProjectStyling", () => {
  it("injects postcss and tailwind config for Tailwind projects", () => {
    const incompleteProject = {
      ...generatedProjectFixture,
      files: generatedProjectFixture.files.filter(
        (file) => !["postcss.config.js", "tailwind.config.js"].includes(file.path),
      ),
    };
    const { project, applied } = normalizeProjectStyling(incompleteProject);

    expect(applied).toContain("postcss_config_injected");
    expect(applied).toContain("tailwind_config_injected");
    expect(project.files.some((file) => file.path === "postcss.config.js")).toBe(true);
    expect(project.files.some((file) => file.path === "tailwind.config.js")).toBe(true);
    expect(project.devDependencies?.tailwindcss).toBeTruthy();
    expect(project.devDependencies?.postcss).toBeTruthy();
    expect(project.devDependencies?.autoprefixer).toBeTruthy();
  });
});

describe("compileTailwindCss", () => {
  it("generates CSS rules for utilities used in JSX", async () => {
    const { project } = normalizeProjectStyling(generatedProjectFixture);
    const compiled = await compileTailwindCss(project);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }

    const missing = cssContainsUtilityRules(compiled.css, [
      "min-h-screen",
      "bg-slate-950",
      "text-white",
      "text-4xl",
      "font-bold",
    ]);
    expect(missing).toEqual([]);
  });
});

describe("validateTailwindSetup", () => {
  it("fails when JSX uses Tailwind but config files are missing", () => {
    const incompleteProject = {
      ...generatedProjectFixture,
      files: generatedProjectFixture.files.filter(
        (file) => !["postcss.config.js", "tailwind.config.js"].includes(file.path),
      ),
    };
    const issues = validateTailwindSetup(incompleteProject);
    expect(issues.some((issue) => issue.code === "MISSING_POSTCSS_CONFIG")).toBe(true);
    expect(issues.some((issue) => issue.code === "MISSING_TAILWIND_CONFIG")).toBe(true);
  });

  it("passes after styling normalization", () => {
    const { project } = normalizeProjectStyling(generatedProjectFixture);
    const issues = validateTailwindSetup(project);
    expect(issues).toEqual([]);
  });
});

describe("detectVerticalStackLayoutMismatch", () => {
  it("flags missing grid utilities as a major layout mismatch", async () => {
    const issues = detectVerticalStackLayoutMismatch({
      utilityClasses: ["grid", "grid-cols-2", "grid-cols-3"],
      compiledCss: ".min-h-screen { min-height: 100vh; }",
    });

    expect(issues.some((issue) => issue.code === "LAYOUT_GRID_UTILITIES_MISSING")).toBe(true);
  });
});

describe("dashboard layout utilities", () => {
  it("includes responsive grid utilities after compilation", async () => {
    const dashboardProject = {
      ...generatedProjectFixture,
      files: [
        ...generatedProjectFixture.files.filter((file) => file.path !== "src/App.tsx"),
        {
          path: "src/App.tsx",
          language: "tsx" as const,
          purpose: "Dashboard root",
          content: [
            'export default function App() {',
            '  return (',
            '    <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">',
            '      <section className="grid grid-cols-2 gap-6" />',
            "    </main>",
            "  );",
            "}",
          ].join("\n"),
        },
      ],
    };

    const { project } = normalizeProjectStyling(dashboardProject);
    const compiled = await compileTailwindCss(project);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }

    expect(cssContainsUtilityRules(compiled.css, ["grid-cols-2", "md:grid-cols-2", "lg:grid-cols-3"])).toEqual([]);
  });
});
