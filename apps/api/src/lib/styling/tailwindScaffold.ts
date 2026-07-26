import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { analyzeTailwindUsage } from "./tailwindClassScanner.js";

export const TAILWIND_V3_DEV_DEPENDENCIES = {
  tailwindcss: "^3.4.17",
  postcss: "^8.4.49",
  autoprefixer: "^10.4.20",
} as const;

export const DEFAULT_CUSTOM_COLORS: Record<string, string> = {
  backgroundDarkBlue: "#0B1B3F",
  backgroundDark: "#0B1B3F",
  textWhite: "#FFFFFF",
  textGrayLight: "#B0B8D4",
  textGreen: "#22C55E",
  textRed: "#EF4444",
  accentOrange: "#FF6F00",
};

function extractHexColorsFromCss(css: string): string[] {
  const matches = css.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
  return [...new Set(matches)];
}

function inferColorsFromStylesheet(stylesheetContent: string, customColorNames: string[]): Record<string, string> {
  const colors: Record<string, string> = { ...DEFAULT_CUSTOM_COLORS };
  const hexColors = extractHexColorsFromCss(stylesheetContent);

  if (hexColors.includes("#0B1B3F")) {
    colors.backgroundDarkBlue = "#0B1B3F";
    colors.backgroundDark = "#0B1B3F";
  }
  if (hexColors.includes("#FFFFFF")) {
    colors.textWhite = "#FFFFFF";
  }
  if (hexColors.includes("#B0B8D4")) {
    colors.textGrayLight = "#B0B8D4";
  }
  if (hexColors.includes("#FF6F00")) {
    colors.accentOrange = "#FF6F00";
  }

  for (const colorName of customColorNames) {
    if (!colors[colorName]) {
      colors[colorName] = DEFAULT_CUSTOM_COLORS[colorName] ?? "#FFFFFF";
    }
  }

  return colors;
}

export function buildPostcssConfigContent(): string {
  return [
    "export default {",
    "  plugins: {",
    "    tailwindcss: {},",
    "    autoprefixer: {},",
    "  },",
    "};",
    "",
  ].join("\n");
}

export function buildTailwindConfigContent(input: {
  colors: Record<string, string>;
  safelist: string[];
}): string {
  const colorEntries = Object.entries(input.colors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `        ${name}: "${value}",`)
    .join("\n");

  const safelistEntries = input.safelist
    .sort()
    .map((className) => `    "${className}",`)
    .join("\n");

  const safelistBlock =
    input.safelist.length > 0
      ? [
          "  safelist: [",
          safelistEntries,
          "  ],",
        ].join("\n")
      : "";

  return [
    "/** @type {import('tailwindcss').Config} */",
    "export default {",
    '  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],',
    "  theme: {",
    "    extend: {",
    "      colors: {",
    colorEntries,
    "      },",
    "      fontFamily: {",
    '        sans: ["Inter", "system-ui", "sans-serif"],',
    "      },",
    "    },",
    "  },",
    safelistBlock,
    "  plugins: [],",
    "};",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTailwindScaffold(project: GeneratedProjectV1): {
  postcssConfig: string;
  tailwindConfig: string;
  safelist: string[];
  colors: Record<string, string>;
} {
  const analysis = analyzeTailwindUsage(project);
  const stylesheet = project.files.find((file) => file.path.endsWith(".css"));
  const colors = inferColorsFromStylesheet(stylesheet?.content ?? "", analysis.customColorNames);

  const safelist = [...new Set([...analysis.dynamicColorClasses])];

  return {
    postcssConfig: buildPostcssConfigContent(),
    tailwindConfig: buildTailwindConfigContent({ colors, safelist }),
    safelist,
    colors,
  };
}

export function usesTailwindV4Syntax(project: GeneratedProjectV1): boolean {
  const stylesheet = project.files.find((file) => file.path.endsWith(".css"));
  const hasV4Import = stylesheet?.content.includes('@import "tailwindcss"') ?? false;
  const hasV4Plugin = Boolean(project.devDependencies?.["@tailwindcss/vite"]);
  return hasV4Import || hasV4Plugin;
}
