import type { EditIntentV1, ProjectEditV1 } from "@reactify/generation-contracts";

const heroSectionContent = [
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
].join("\n");

export const editIntentFixture: EditIntentV1 = {
  schemaVersion: "1",
  responseVersion: "mock-edit-intent-v1",
  summary: "Change primary button styling to dark blue.",
  intentType: "style_change",
  affectedFiles: ["src/components/HeroSection.tsx"],
  affectedComponents: ["HeroSection"],
  requiresDependencyChange: false,
  riskLevel: "low",
  assumptions: ["Primary button refers to the hero CTA."],
  clarificationRequired: false,
};

export const projectEditFixture: ProjectEditV1 = {
  schemaVersion: "1",
  responseVersion: "mock-project-edit-v1",
  editSummary: "Updated hero CTA button to dark blue.",
  interpretedInstruction: "Make the primary button dark blue.",
  changedFiles: [
    {
      path: "src/components/HeroSection.tsx",
      fullContent: heroSectionContent.replace(
        "    </section>",
        '      <button className="mt-6 rounded-lg bg-blue-900 px-4 py-2 text-white">Get Started</button>\n    </section>',
      ),
      language: "tsx",
      reason: "Apply dark blue styling to the primary CTA button.",
    },
  ],
  deletedFiles: [],
  dependencyChanges: [],
  affectedComponents: ["HeroSection"],
  expectedVisualChanges: ["Primary CTA button appears dark blue."],
  expectedBehaviorChanges: [],
  unresolvedRisks: [],
};

export function createEditIntentFixtureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...editIntentFixture, ...overrides });
}

export function createProjectEditFixtureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...projectEditFixture, ...overrides });
}
