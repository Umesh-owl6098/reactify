import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { PipelineStatus } from "./PipelineStatus";

const readyStatus: GenerationStatusResponse = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  imageId: "660e8400-e29b-41d4-a716-446655440000",
  projectId: "770e8400-e29b-41d4-a716-446655440000",
  status: "Ready",
  activeStage: null,
  stages: [],
  outputs: {
    designAnalysis: {
      schemaVersion: "1",
      responseVersion: "mock-v1",
      layoutHierarchy: "Header > Hero",
      componentHierarchy: [],
      colors: [],
      typography: [],
      spacing: [],
    },
    generationPlan: {
      schemaVersion: "1",
      responseVersion: "mock-v1",
      components: [{ name: "Hero", type: "layout", purpose: "Hero", props: [], children: false, dependencies: [], accessibilityNotes: "ok" }],
      files: [{ path: "src/App.tsx", language: "tsx", purpose: "entry", components: ["Hero"] }],
      designTokens: { colors: {}, typography: {}, spacing: {} },
      dependencies: { react: "^18.3.1" },
      responsiveStrategy: "Stack on mobile",
      accessibilityStrategy: "Semantic landmarks",
      confidenceWarnings: [],
    },
    generatedProject: {
      schemaVersion: "1",
      responseVersion: "mock-v1",
      projectName: "MockLandingPage",
      summary: "Mock project",
      dependencies: { react: "^18.3.1" },
      files: [{ path: "src/App.tsx", language: "tsx", content: "export {}", purpose: "component" }],
      entryFile: "src/App.tsx",
      warnings: [],
    },
  },
  errors: [],
  analysis: {
    provider: "mock",
    model: "mock-model-v1",
    promptVersion: "1.0.0",
    schemaVersion: "1",
    inputTokens: 100,
    outputTokens: 500,
    latencyMs: 50,
    temperature: 0.2,
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  durations: { totalMs: 10, stages: {} },
};

describe("PipelineStatus", () => {
  it("shows mocked output summaries when the pipeline is ready", () => {
    render(<PipelineStatus status={readyStatus} isPolling={false} error={null} />);
    expect(screen.getByRole("heading", { name: "Generation pipeline" })).toBeInTheDocument();
    expect(screen.getByText("Design analysis completed")).toBeInTheDocument();
    expect(screen.getByText("Header > Hero")).toBeInTheDocument();
    expect(screen.getByText(/mock-model-v1/)).toBeInTheDocument();
    expect(screen.getByText("Generated Project (mock)")).toBeInTheDocument();
  });
});
