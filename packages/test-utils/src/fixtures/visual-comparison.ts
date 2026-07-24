import type { VisualCorrectionV1 } from "@reactify/generation-contracts";
import { createProjectEditFixtureJson } from "./edit.js";

export const visualCorrectionFixture: VisualCorrectionV1 = {
  schemaVersion: "1",
  responseVersion: "mock-visual-correction-v1",
  correctionSummary: "Adjust hero spacing and heading color.",
  targetedRegions: ["region-1"],
  changedFiles: [
    {
      path: "src/components/HeroSection.tsx",
      fullContent: [
        "export function HeroSection() {",
        "  return <section className=\"px-8 py-20 text-blue-900\"><h1>Hero</h1></section>;",
        "}",
      ].join("\n"),
      language: "tsx",
      reason: "Match heading color and spacing to the source screenshot.",
    },
  ],
  deletedFiles: [],
  dependencyChanges: [],
  expectedImprovements: ["Heading color closer to source screenshot."],
  unresolvedVisualRisks: ["Exact font rendering may still differ in Sandpack."],
};

export function createVisualCorrectionFixtureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...visualCorrectionFixture, ...overrides });
}

export function createProjectEditJsonForVisualTests(): string {
  return createProjectEditFixtureJson();
}
