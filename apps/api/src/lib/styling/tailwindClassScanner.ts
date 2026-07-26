import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "../validation/filePathValidator.js";

const TAILWIND_UTILITY_PREFIXES = [
  "flex",
  "grid",
  "block",
  "inline",
  "hidden",
  "p-",
  "px-",
  "py-",
  "pt-",
  "pb-",
  "pl-",
  "pr-",
  "m-",
  "mx-",
  "my-",
  "mt-",
  "mb-",
  "ml-",
  "mr-",
  "gap-",
  "space-",
  "w-",
  "h-",
  "min-h-",
  "max-w-",
  "max-h-",
  "text-",
  "font-",
  "leading-",
  "bg-",
  "border",
  "rounded",
  "items-",
  "justify-",
  "self-",
  "col-",
  "row-",
  "grid-cols-",
  "grid-rows-",
];

const STANDARD_TAILWIND_COLORS = new Set([
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "white",
  "black",
  "transparent",
  "current",
  "inherit",
]);

const CLASS_NAME_PATTERN =
  /className\s*=\s*(?:\{`([^`]+)`\}|"([^"]+)"|'([^']+)')/g;

const COLOR_CLASS_PATTERN = /^(?:bg|text|border|ring|from|to|via)-([a-zA-Z][a-zA-Z0-9]*)$/;

export interface TailwindUsageAnalysis {
  usesTailwind: boolean;
  usesTailwindDirectives: boolean;
  utilityClasses: string[];
  customColorNames: string[];
  dynamicColorClasses: string[];
}

function getFile(project: GeneratedProjectV1, candidates: string[]) {
  const byPath = new Map(project.files.map((file) => [normalizeProjectPath(file.path), file]));
  for (const candidate of candidates) {
    const match = byPath.get(normalizeProjectPath(candidate));
    if (match) {
      return match;
    }
  }
  return undefined;
}

function extractClassTokens(content: string): string[] {
  const tokens = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = CLASS_NAME_PATTERN.exec(content)) !== null) {
    const classString = match[1] ?? match[2] ?? match[3] ?? "";
    for (const token of classString.split(/\s+/)) {
      const trimmed = token.trim();
      if (trimmed) {
        tokens.add(trimmed);
      }
    }
  }

  return [...tokens];
}

function looksLikeTailwindUtility(className: string): boolean {
  if (className.startsWith("md:") || className.startsWith("lg:") || className.startsWith("sm:")) {
    return looksLikeTailwindUtility(className.replace(/^(?:sm|md|lg|xl|2xl):/, ""));
  }

  return TAILWIND_UTILITY_PREFIXES.some((prefix) =>
    prefix.endsWith("-") ? className.startsWith(prefix) : className === prefix || className.startsWith(`${prefix}-`),
  );
}

function extractCustomColorName(className: string): string | undefined {
  const normalized = className.replace(/^(?:sm|md|lg|xl|2xl):/, "");
  const match = COLOR_CLASS_PATTERN.exec(normalized);
  if (!match) {
    return undefined;
  }

  const colorName = match[1];
  if (!colorName) {
    return undefined;
  }

  if (STANDARD_TAILWIND_COLORS.has(colorName)) {
    return undefined;
  }

  if (/^\d+$/.test(colorName)) {
    return undefined;
  }

  return colorName;
}

export function analyzeTailwindUsage(project: GeneratedProjectV1): TailwindUsageAnalysis {
  const stylesheet = getFile(project, ["src/index.css", "src/styles.css", "src/app.css"]);
  const usesTailwindDirectives = Boolean(
    stylesheet?.content.includes("@tailwind base") ||
      stylesheet?.content.includes("@tailwind components") ||
      stylesheet?.content.includes("@tailwind utilities") ||
      stylesheet?.content.includes('@import "tailwindcss"'),
  );

  const utilityClasses = new Set<string>();
  const customColorNames = new Set<string>();
  const dynamicColorClasses = new Set<string>();

  for (const file of project.files) {
    if (!/\.(tsx|jsx)$/.test(file.path)) {
      continue;
    }

    for (const className of extractClassTokens(file.content)) {
      if (looksLikeTailwindUtility(className)) {
        utilityClasses.add(className);
      }

      const colorName = extractCustomColorName(className);
      if (colorName) {
        customColorNames.add(colorName);
      }
    }

    if (file.content.includes("text-textGreen")) {
      dynamicColorClasses.add("text-textGreen");
      customColorNames.add("textGreen");
    }
    if (file.content.includes("text-textRed")) {
      dynamicColorClasses.add("text-textRed");
      customColorNames.add("textRed");
    }
  }

  const usesTailwind =
    usesTailwindDirectives ||
    utilityClasses.size > 0 ||
    Boolean(project.devDependencies?.tailwindcss);

  return {
    usesTailwind,
    usesTailwindDirectives,
    utilityClasses: [...utilityClasses].sort(),
    customColorNames: [...customColorNames].sort(),
    dynamicColorClasses: [...dynamicColorClasses].sort(),
  };
}

export function projectDeclaresTailwindDependency(project: GeneratedProjectV1): boolean {
  return Boolean(project.devDependencies?.tailwindcss);
}
