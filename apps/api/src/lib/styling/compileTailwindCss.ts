import { runInNewContext } from "node:vm";
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

/**
 * Generated projects routinely extend the Tailwind theme (custom colors, font
 * families) in their own tailwind.config; compiling without that theme rejects
 * valid utilities and `@apply` rules. Evaluate only the config's object
 * literal in an isolated vm context — no require, module system stubbed, hard
 * timeout — and use only its `theme`. Any failure falls back to no theme.
 */
export function extractProjectTailwindTheme(
  project: GeneratedProjectV1,
): Record<string, unknown> | undefined {
  const configFile = project.files.find((file) =>
    /(?:^|\/)tailwind\.config\.(?:js|cjs|mjs|ts)$/.test(normalizeProjectPath(file.path)),
  );
  if (!configFile) {
    return undefined;
  }

  const source = configFile.content
    .replace(/^\s*import[^\n]*$/gm, "")
    .replace(/export\s+default/, "module.exports =")
    .replace(/satisfies\s+[A-Za-z0-9_$.<>[\]\s]+;?\s*$/m, ";");

  const sandbox: { module: { exports: unknown }; exports: unknown; require: () => unknown } = {
    module: { exports: {} },
    exports: {},
    require: () => ({}),
  };

  try {
    runInNewContext(source, sandbox, { timeout: 250 });
  } catch {
    return undefined;
  }

  const exported = sandbox.module.exports as { default?: unknown } | undefined;
  const config = (exported?.default ?? exported) as { theme?: unknown } | undefined;
  if (!config || typeof config !== "object" || !config.theme || typeof config.theme !== "object") {
    return undefined;
  }
  return config.theme as Record<string, unknown>;
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
  const projectTheme = extractProjectTailwindTheme(project);
  const projectExtend = (projectTheme?.extend ?? {}) as Record<string, unknown>;

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
          ...(projectTheme && typeof projectTheme === "object" ? projectTheme : {}),
          extend: {
            ...projectExtend,
            colors: {
              ...scaffold.colors,
              ...((projectExtend.colors as Record<string, string> | undefined) ?? {}),
            },
            fontFamily: {
              sans: ["Inter", "system-ui", "sans-serif"],
              ...((projectExtend.fontFamily as Record<string, string[]> | undefined) ?? {}),
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
