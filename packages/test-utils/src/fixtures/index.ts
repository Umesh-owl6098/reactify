import type { DesignAnalysisV1 } from "@reactify/generation-contracts";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import type { GenerationPlanV1 } from "@reactify/generation-contracts";

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
    {
      name: "FeatureGrid",
      type: "layout",
      purpose: "Displays three feature cards in a responsive grid",
      props: [],
      children: false,
      dependencies: ["HeroSection"],
      accessibilityNotes: "Grid uses list semantics with descriptive headings",
    },
  ],
  files: [
    {
      path: "src/App.tsx",
      language: "tsx",
      purpose: "Application entry composition",
      components: ["HeroSection", "FeatureGrid"],
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
  files: [
    {
      path: "src/App.tsx",
      language: "tsx",
      purpose: "component",
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
      purpose: "component",
      content: [
        "interface HeroSectionProps {",
        "  title: string;",
        "}",
        "",
        "export function HeroSection({ title }: HeroSectionProps) {",
        "  return (",
        '    <section className="mx-auto max-w-4xl px-6 py-16">',
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
  entryFile: "src/App.tsx",
  warnings: ["Mock fixture project for pipeline framework validation"],
};
