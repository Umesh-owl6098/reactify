import type { ProjectPatchV1 } from "@reactify/generation-contracts";

const appFileContent = [
  'import { HeroSection } from "./components/HeroSection";',
  "",
  "export default function App() {",
  "  return (",
  '    <main className="min-h-screen bg-slate-950 text-white">',
  '      <HeroSection title="Build faster with Reactify" />',
  "    </main>",
  "  );",
  "}",
].join("\n");

export const projectPatchFixture: ProjectPatchV1 = {
  schemaVersion: "1",
  responseVersion: "mock-repair-v1",
  repairSummary: "Fix App component export and render path.",
  changedFiles: [
    {
      path: "src/App.tsx",
      fullContent: `${appFileContent}\n// repaired`,
      language: "tsx",
      reason: "Ensure App renders valid JSX after compilation error.",
    },
  ],
  deletedFiles: [],
  dependencyChanges: [],
  expectedResolvedDiagnostics: [],
  unresolvedRisks: [],
};

export function createProjectPatchFixtureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...projectPatchFixture,
    ...overrides,
  });
}
