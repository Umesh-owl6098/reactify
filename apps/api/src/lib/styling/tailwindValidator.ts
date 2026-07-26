import type { GeneratedProjectV1, ValidationIssue } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "../validation/filePathValidator.js";
import { analyzeTailwindUsage, projectDeclaresTailwindDependency } from "./tailwindClassScanner.js";
import { usesTailwindV4Syntax } from "./tailwindScaffold.js";

function issue(code: string, message: string, filePath?: string): ValidationIssue {
  return { code, message, severity: "error", filePath };
}

function findFile(project: GeneratedProjectV1, candidates: string[]) {
  const byPath = new Map(project.files.map((file) => [normalizeProjectPath(file.path), file]));
  for (const candidate of candidates) {
    const match = byPath.get(normalizeProjectPath(candidate));
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function validateTailwindSetup(project: GeneratedProjectV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const analysis = analyzeTailwindUsage(project);

  if (!analysis.usesTailwind) {
    return issues;
  }

  const usesUtilitiesInJsx = analysis.utilityClasses.length > 0;
  const declaresDependency = projectDeclaresTailwindDependency(project);

  if (usesUtilitiesInJsx && !declaresDependency && !analysis.usesTailwindDirectives) {
    issues.push(
      issue(
        "MISSING_TAILWIND_DEPENDENCY",
        "JSX uses Tailwind utility classes but package.json does not declare tailwindcss.",
        "package.json",
      ),
    );
  }

  if (usesTailwindV4Syntax(project)) {
    if (!project.devDependencies?.["@tailwindcss/vite"]) {
      issues.push(
        issue(
          "MISSING_TAILWIND_V4_PLUGIN",
          "Tailwind v4 @import syntax requires @tailwindcss/vite in devDependencies.",
          "package.json",
        ),
      );
    }

    const viteConfig = findFile(project, ["vite.config.ts", "vite.config.js"]);
    if (viteConfig && !viteConfig.content.includes("tailwindcss()")) {
      issues.push(
        issue(
          "MISSING_TAILWIND_VITE_PLUGIN",
          "Tailwind v4 requires tailwindcss() in vite.config.ts plugins.",
          viteConfig.path,
        ),
      );
    }

    return issues;
  }

  if (!project.devDependencies?.tailwindcss) {
    issues.push(
      issue(
        "MISSING_TAILWIND_DEPENDENCY",
        "Tailwind CSS is referenced but tailwindcss is missing from devDependencies.",
        "package.json",
      ),
    );
  }

  if (!project.devDependencies?.postcss) {
    issues.push(
      issue(
        "MISSING_POSTCSS_DEPENDENCY",
        "Tailwind CSS v3 requires postcss in devDependencies.",
        "package.json",
      ),
    );
  }

  if (!project.devDependencies?.autoprefixer) {
    issues.push(
      issue(
        "MISSING_AUTOPREFIXER_DEPENDENCY",
        "Tailwind CSS v3 requires autoprefixer in devDependencies.",
        "package.json",
      ),
    );
  }

  const postcssConfig = findFile(project, ["postcss.config.js", "postcss.config.cjs", "postcss.config.mjs"]);
  if (!postcssConfig) {
    issues.push(
      issue(
        "MISSING_POSTCSS_CONFIG",
        "Tailwind CSS v3 requires postcss.config.js with tailwindcss and autoprefixer plugins.",
      ),
    );
  } else if (!postcssConfig.content.includes("tailwindcss")) {
    issues.push(
      issue(
        "INVALID_POSTCSS_CONFIG",
        "postcss.config.js must register the tailwindcss plugin.",
        postcssConfig.path,
      ),
    );
  }

  const tailwindConfig = findFile(project, ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs"]);
  if (!tailwindConfig) {
    issues.push(
      issue(
        "MISSING_TAILWIND_CONFIG",
        "Tailwind CSS v3 requires tailwind.config.js with content paths for index.html and src/**/*.{js,ts,jsx,tsx}.",
      ),
    );
  } else {
    if (!tailwindConfig.content.includes("index.html")) {
      issues.push(
        issue(
          "INVALID_TAILWIND_CONTENT_PATHS",
          "tailwind.config.js must include index.html in content paths.",
          tailwindConfig.path,
        ),
      );
    }

    if (!tailwindConfig.content.includes("src/**/*")) {
      issues.push(
        issue(
          "INVALID_TAILWIND_CONTENT_PATHS",
          "tailwind.config.js must include src/**/*.{js,ts,jsx,tsx} in content paths.",
          tailwindConfig.path,
        ),
      );
    }
  }

  const stylesheet = findFile(project, ["src/index.css", "src/styles.css", "src/app.css"]);
  if (!stylesheet) {
    issues.push(issue("MISSING_STYLESHEET", "Tailwind requires a global stylesheet such as src/index.css."));
  } else if (
    !stylesheet.content.includes("@tailwind base") &&
    !stylesheet.content.includes("@tailwind utilities") &&
    !stylesheet.content.includes('@import "tailwindcss"')
  ) {
    issues.push(
      issue(
        "MISSING_TAILWIND_DIRECTIVES",
        "Global stylesheet must include @tailwind base/components/utilities directives.",
        stylesheet.path,
      ),
    );
  }

  const mainEntry = findFile(project, ["src/main.tsx", "src/main.jsx"]);
  if (mainEntry && stylesheet && !mainEntry.content.includes(stylesheet.path.replace(/^src\//, "./"))) {
    issues.push(
      issue(
        "MAIN_STYLESHEET_IMPORT_MISSING",
        "Main entry must import the global Tailwind stylesheet.",
        mainEntry.path,
      ),
    );
  }

  if (usesTailwindV4Syntax(project) && postcssConfig?.content.includes("tailwindcss")) {
    issues.push(
      issue(
        "TAILWIND_VERSION_MIXED",
        "Do not mix Tailwind v3 PostCSS configuration with Tailwind v4 @import syntax.",
      ),
    );
  }

  return issues;
}

export function validateTailwindCssCoverage(
  utilityClasses: string[],
  compiledCss: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const required = [...new Set(utilityClasses.filter((className) => !className.includes("[") && !className.includes(":")))];

  for (const className of required) {
    const escaped = className.replace(/[/[\].]/g, "\\$&");
    const selectorPattern = new RegExp(`\\.${escaped}(?:\\s|,|\\{|:|>)`);
    if (!selectorPattern.test(compiledCss)) {
      issues.push(
        issue(
          "MISSING_TAILWIND_UTILITY_CSS",
          `Compiled CSS is missing utility rule for "${className}". Tailwind compiler is not active.`,
        ),
      );
    }
  }

  return issues;
}

export function detectVerticalStackLayoutMismatch(input: {
  utilityClasses: string[];
  compiledCss: string;
}): ValidationIssue[] {
  const usesMultiColumnGrid = input.utilityClasses.some(
    (className) => className === "grid-cols-2" || className === "grid-cols-3" || className.startsWith("md:grid-cols-"),
  );

  if (!usesMultiColumnGrid) {
    return [];
  }

  const missingGridCols = ["grid", "grid-cols-2", "grid-cols-3"].filter((className) => {
    const escaped = className.replace(/[/[\].]/g, "\\$&");
    return !new RegExp(`\\.${escaped}(?:\\s|,|\\{|:|>)`).test(input.compiledCss);
  });

  if (missingGridCols.length === 0) {
    return [];
  }

  return [
    issue(
      "LAYOUT_GRID_UTILITIES_MISSING",
      `Dashboard uses multi-column grid classes (${missingGridCols.join(", ")}) but compiled CSS lacks matching rules, which produces a vertically stacked layout mismatch.`,
    ),
  ];
}
