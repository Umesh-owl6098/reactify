import type { DesignAnalysisV1 } from "@reactify/generation-contracts";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import type { GenerationPlanV1 } from "@reactify/generation-contracts";

export { projectPatchFixture, createProjectPatchFixtureJson } from "./projectPatch.js";
export {
  editIntentFixture,
  projectEditFixture,
  createEditIntentFixtureJson,
  createProjectEditFixtureJson,
} from "./edit.js";
export {
  visualCorrectionFixture,
  createVisualCorrectionFixtureJson,
} from "./visual-comparison.js";

export const designAnalysisFixture: DesignAnalysisV1 = {
  schemaVersion: "1",
  responseVersion: "mock-v1",
  layoutHierarchy: "Header > Hero > FeatureGrid > Footer",
  componentHierarchy: [
    {
      id: "hero",
      type: "section",
      description: "Primary hero banner with headline and call to action",
      children: [
        {
          id: "hero-title",
          type: "heading",
          description: "Main page headline",
        },
        {
          id: "hero-cta",
          type: "button",
          description: "Primary call-to-action button",
        },
      ],
    },
  ],
  colors: [
    { name: "primary", hex: "#6366F1", usage: "Buttons and accents" },
    { name: "background", hex: "#0F172A", usage: "Page background" },
    { name: "surface", hex: "#1E293B", usage: "Cards and panels" },
  ],
  typography: [
    {
      element: "h1",
      fontFamily: "Inter",
      fontSize: "48px",
      fontWeight: "700",
      lineHeight: "1.1",
    },
    {
      element: "body",
      fontFamily: "Inter",
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "1.5",
    },
  ],
  spacing: [
    { name: "sm", value: "8px" },
    { name: "md", value: "16px" },
    { name: "lg", value: "24px" },
  ],
  borders: "1px solid rgba(148, 163, 184, 0.2)",
  shadows: "0 10px 30px rgba(15, 23, 42, 0.35)",
  interactions: ["Primary button hover state", "Feature card hover elevation"],
  responsiveBehavior: "Hero stacks vertically on tablet and mobile breakpoints",
};

export const generationPlanFixture: GenerationPlanV1 = {
  schemaVersion: "1",
  responseVersion: "mock-v1",
  components: [
    {
      name: "HeroSection",
      type: "layout",
      purpose: "Renders the hero headline and primary CTA",
      props: [
        {
          name: "title",
          type: "string",
          required: true,
          description: "Hero headline text",
        },
      ],
      children: false,
      dependencies: [],
      accessibilityNotes: "Uses a semantic section with an h1 heading",
    },
  ],
  files: [
    {
      path: "package.json",
      language: "json",
      purpose: "Project manifest",
      components: [],
    },
    {
      path: "index.html",
      language: "html",
      purpose: "HTML shell",
      components: [],
    },
    {
      path: "src/main.tsx",
      language: "tsx",
      purpose: "Application bootstrap",
      components: [],
    },
    {
      path: "src/index.css",
      language: "css",
      purpose: "Global styles",
      components: [],
    },
    {
      path: "vite.config.ts",
      language: "ts",
      purpose: "Vite configuration",
      components: [],
    },
    {
      path: "tsconfig.json",
      language: "json",
      purpose: "TypeScript configuration",
      components: [],
    },
    {
      path: "src/App.tsx",
      language: "tsx",
      purpose: "Application entry composition",
      components: ["HeroSection"],
    },
    {
      path: "src/components/HeroSection.tsx",
      language: "tsx",
      purpose: "Hero layout component",
      components: ["HeroSection"],
    },
  ],
  designTokens: {
    colors: {
      primary: "#6366F1",
      background: "#0F172A",
      surface: "#1E293B",
    },
    typography: {
      heading: "48px / 700",
      body: "16px / 400",
    },
    spacing: {
      sm: "8px",
      md: "16px",
      lg: "24px",
    },
    borderRadius: {
      md: "12px",
    },
  },
  dependencies: {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  },
  devDependencies: {
    typescript: "^5.7.3",
    vite: "^6.0.11",
    "@vitejs/plugin-react": "^4.3.4",
    tailwindcss: "^3.4.17",
    postcss: "^8.5.1",
    autoprefixer: "^10.4.20",
  },
  responsiveStrategy: "Stack hero content and reduce feature grid columns on smaller breakpoints",
  accessibilityStrategy: "Use semantic landmarks, visible focus states, and descriptive button labels",
  confidenceWarnings: ["Mock fixture: icon placement inferred from screenshot spacing"],
};

export const generatedProjectFixture: GeneratedProjectV1 = {
  schemaVersion: "1",
  responseVersion: "mock-v1",
  projectName: "MockLandingPage",
  summary: "Mock React + Tailwind landing page generated from fixture data",
  dependencies: {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  },
  devDependencies: {
    typescript: "^5.7.3",
    vite: "^6.0.11",
    "@vitejs/plugin-react": "^4.3.4",
    tailwindcss: "^3.4.17",
    postcss: "^8.5.1",
    autoprefixer: "^10.4.20",
  },
  components: [
    {
      name: "App",
      filePath: "src/App.tsx",
      exported: true,
      props: [],
      dependencies: ["HeroSection"],
      accessibilityNotes: "Uses main landmark wrapper",
    },
    {
      name: "HeroSection",
      filePath: "src/components/HeroSection.tsx",
      exported: true,
      props: [
        {
          name: "title",
          type: "string",
          required: true,
          description: "Hero headline text",
        },
      ],
      dependencies: [],
      accessibilityNotes: "Section includes semantic heading",
    },
  ],
  files: [
    {
      path: "package.json",
      language: "json",
      purpose: "Project manifest",
      content: JSON.stringify(
        {
          name: "mock-landing-page",
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc && vite build",
          },
          dependencies: {
            react: "^18.3.1",
            "react-dom": "^18.3.1",
          },
          devDependencies: {
            typescript: "^5.7.3",
            vite: "^6.0.11",
            "@vitejs/plugin-react": "^4.3.4",
            tailwindcss: "^3.4.17",
            postcss: "^8.5.1",
            autoprefixer: "^10.4.20",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "index.html",
      language: "html",
      purpose: "HTML shell",
      content: [
        "<!doctype html>",
        '<html lang="en">',
        "  <head>",
        '    <meta charset="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        "    <title>Mock Landing Page</title>",
        "  </head>",
        "  <body>",
        '    <div id="root"></div>',
        '    <script type="module" src="/src/main.tsx"></script>',
        "  </body>",
        "</html>",
      ].join("\n"),
    },
    {
      path: "src/main.tsx",
      language: "tsx",
      purpose: "Application bootstrap",
      content: [
        'import { StrictMode } from "react";',
        'import { createRoot } from "react-dom/client";',
        'import App from "./App";',
        'import "./index.css";',
        "",
        'createRoot(document.getElementById("root")!).render(',
        "  <StrictMode>",
        "    <App />",
        "  </StrictMode>,",
        ");",
      ].join("\n"),
    },
    {
      path: "src/index.css",
      language: "css",
      purpose: "Global styles",
      content: ["@tailwind base;", "@tailwind components;", "@tailwind utilities;"].join("\n"),
    },
    {
      path: "postcss.config.js",
      language: "js",
      purpose: "PostCSS configuration for Tailwind CSS",
      content: [
        "export default {",
        "  plugins: {",
        "    tailwindcss: {},",
        "    autoprefixer: {},",
        "  },",
        "};",
      ].join("\n"),
    },
    {
      path: "tailwind.config.js",
      language: "js",
      purpose: "Tailwind CSS configuration",
      content: [
        "/** @type {import('tailwindcss').Config} */",
        "export default {",
        '  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],',
        "  theme: { extend: {} },",
        "  plugins: [],",
        "};",
      ].join("\n"),
    },
    {
      path: "vite.config.ts",
      language: "ts",
      purpose: "Vite configuration",
      content: [
        'import { defineConfig } from "vite";',
        'import react from "@vitejs/plugin-react";',
        "",
        "export default defineConfig({",
        "  plugins: [react()],",
        "});",
      ].join("\n"),
    },
    {
      path: "tsconfig.json",
      language: "json",
      purpose: "TypeScript configuration",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "ESNext",
            jsx: "react-jsx",
            moduleResolution: "Bundler",
            strict: true,
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "src/App.tsx",
      language: "tsx",
      purpose: "Application composition",
      content: [
        'import { HeroSection } from "./components/HeroSection";',
        "",
        "export default function App() {",
        "  return (",
        '    <main className="min-h-screen bg-slate-950 text-white">',
        '      <HeroSection title="Build faster with Reactify" />',
        "    </main>",
        "  );",
        "}",
      ].join("\n"),
      componentMetadata: {
        name: "App",
        purpose: "Root application component",
        props: [],
        children: false,
        dependencies: ["HeroSection"],
        accessibilityNotes: "Uses main landmark wrapper",
      },
    },
    {
      path: "src/components/HeroSection.tsx",
      language: "tsx",
      purpose: "Hero layout component",
      content: [
        "interface HeroSectionProps {",
        "  title: string;",
        "}",
        "",
        "export function HeroSection({ title }: HeroSectionProps) {",
        "  return (",
        '    <section className="mx-auto max-w-4xl px-6 py-16 sm:px-8">',
        '      <h1 className="text-4xl font-bold">{title}</h1>',
        "    </section>",
        "  );",
        "}",
      ].join("\n"),
      componentMetadata: {
        name: "HeroSection",
        purpose: "Hero section with headline",
        props: [
          {
            name: "title",
            type: "string",
            required: true,
            description: "Hero headline text",
          },
        ],
        children: false,
        dependencies: [],
        accessibilityNotes: "Section includes semantic heading",
      },
    },
  ],
  entryFile: "src/main.tsx",
  warnings: ["Mock fixture project for pipeline framework validation"],
};
