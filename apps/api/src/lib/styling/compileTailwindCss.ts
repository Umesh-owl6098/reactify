import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "../validation/filePathValidator.js";
import { buildTailwindScaffold } from "./tailwindScaffold.js";
import { analyzeTailwindUsage } from "./tailwindClassScanner.js";

export interface CompileTailwindCssResult {
  ok: true;
  css: string;
}

export interface CompileTailwindCssFailure {
  ok: false;
  message: string;
}

export type CompileTailwindCssOutput = CompileTailwindCssResult | CompileTailwindCssFailure;

function findStylesheet(project: GeneratedProjectV1) {
  return project.files.find((file) =>
    ["src/index.css", "src/styles.css", "src/app.css"].includes(normalizeProjectPath(file.path)),
  );
}

export async function compileTailwindCss(project: GeneratedProjectV1): Promise<CompileTailwindCssOutput> {
  const analysis = analyzeTailwindUsage(project);
  if (!analysis.usesTailwind) {
    return { ok: false, message: "Project does not use Tailwind CSS." };
  }

  const stylesheet = findStylesheet(project);
  if (!stylesheet) {
    return { ok: false, message: "Tailwind stylesheet is missing." };
  }

  const scaffold = buildTailwindScaffold(project);

  try {
    const compiled = await postcss([
      tailwindcss({
        content: [
          { raw: stylesheet.content, extension: "css" },
          ...project.files
            .filter((file) => /\.(tsx|jsx|html)$/.test(file.path))
            .map((file) => ({
              raw: file.content,
              extension: file.path.split(".").pop() ?? "tsx",
            })),
        ],
        theme: {
          extend: {
            colors: scaffold.colors,
            fontFamily: {
              sans: ["Inter", "system-ui", "sans-serif"],
            },
          },
        },
        safelist: scaffold.safelist,
      }),
      autoprefixer(),
    ]).process(stylesheet.content, { from: stylesheet.path });

    return { ok: true, css: compiled.css };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Tailwind compilation failed.",
    };
  }
}

export function cssContainsUtilityRules(css: string, classNames: string[]): string[] {
  const missing: string[] = [];

  for (const className of classNames) {
    if (!cssHasUtilityRule(css, className)) {
      missing.push(className);
    }
  }

  return missing;
}

function cssHasUtilityRule(css: string, className: string): boolean {
  if (className.includes(":")) {
    const separatorIndex = className.indexOf(":");
    const variant = className.slice(0, separatorIndex);
    const utility = className.slice(separatorIndex + 1);
    const escapedUtility = utility.replace(/[/[\].]/g, "\\$&");
    const responsivePattern = new RegExp(`\\.${variant}\\\\:${escapedUtility}(?:\\s|,|\\{|:|>)`);
    return responsivePattern.test(css);
  }

  const escaped = className.replace(/[/[\].]/g, "\\$&");
  const selectorPattern = new RegExp(`\\.${escaped}(?:\\s|,|\\{|:|>)`);
  return selectorPattern.test(css);
}

export async function verifyTailwindUtilities(project: GeneratedProjectV1, requiredClasses: string[]): Promise<string[]> {
  const compiled = await compileTailwindCss(project);
  if (!compiled.ok) {
    return requiredClasses;
  }

  return cssContainsUtilityRules(compiled.css, requiredClasses);
}
