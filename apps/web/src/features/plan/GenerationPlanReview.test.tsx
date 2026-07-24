import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { generationPlanFixture } from "@reactify/test-utils";
import { cancelGeneration, confirmGenerationPlan } from "../../lib/generation-api";
import { GenerationPlanReview } from "./GenerationPlanReview";

const baseStatus: GenerationStatusResponse = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  imageId: "660e8400-e29b-41d4-a716-446655440000",
  projectId: "770e8400-e29b-41d4-a716-446655440000",
  status: "Planning",
  activeStage: "generation_plan_review",
  stages: [],
  outputs: {
    designAnalysis: null,
    generationPlan: generationPlanFixture,
    generatedProject: null,
  },
  analysis: null,
  plan: {
    provider: "mock",
    model: "mock-model-v1",
    promptVersion: "1.0.0",
    schemaVersion: "1",
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 75,
    temperature: 0.2,
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  project: null,
  schemaValidation: null,
  staticValidation: null,
  sandboxValidation: null,
  projectHash: null,
  editedByUser: false,
  confirmedAt: null,
  awaitingPlanConfirmation: true,
  awaitingSandboxValidation: false,
  repair: null,
  featureFlags: {
    enableGenerationPlanEditing: true,
  },
  errors: [],
  durations: { totalMs: 0, stages: {} },
};

vi.mock("../../lib/generation-api", () => ({
  confirmGenerationPlan: vi.fn().mockResolvedValue("Generating"),
  cancelGeneration: vi.fn().mockResolvedValue(undefined),
}));

describe("GenerationPlanReview", () => {
  beforeEach(() => {
    vi.mocked(confirmGenerationPlan).mockClear();
    vi.mocked(cancelGeneration).mockClear();
    vi.mocked(confirmGenerationPlan).mockResolvedValue("Generating");
    vi.mocked(cancelGeneration).mockResolvedValue(undefined);
  });

  it("renders components, files, tokens, and warnings", () => {
    render(
      <GenerationPlanReview status={baseStatus} onConfirmed={() => undefined} onCancelled={() => undefined} />,
    );

    expect(screen.getByRole("heading", { name: "Review generation plan" })).toBeInTheDocument();
    expect(screen.getByText("HeroSection")).toBeInTheDocument();
    expect(screen.getByText("src/components/HeroSection.tsx")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Mock fixture: icon placement inferred from screenshot spacing"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm generation plan" })).toBeInTheDocument();
  });

  it("disables confirm for invalid edits", () => {
    render(
      <GenerationPlanReview status={baseStatus} onConfirmed={() => undefined} onCancelled={() => undefined} />,
    );

    const purposeField = screen.getAllByLabelText("Purpose")[0] as HTMLTextAreaElement;
    fireEvent.change(purposeField, { target: { value: "" } });

    expect(screen.getByRole("button", { name: "Confirm generation plan" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Fix validation errors before confirming.");
  });

  it("resets edited plan changes", () => {
    render(
      <GenerationPlanReview status={baseStatus} onConfirmed={() => undefined} onCancelled={() => undefined} />,
    );

    const purposeField = screen.getAllByLabelText("Purpose")[0] as HTMLTextAreaElement;
    fireEvent.change(purposeField, { target: { value: "Edited purpose" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset Changes" }));
    expect(purposeField.value).toBe(generationPlanFixture.components[0]!.purpose);
  });

  it("submits the edited plan on confirm", async () => {
    const onConfirmed = vi.fn();

    render(<GenerationPlanReview status={baseStatus} onConfirmed={onConfirmed} onCancelled={() => undefined} />);

    const purposeField = screen.getAllByLabelText("Purpose")[0] as HTMLTextAreaElement;
    fireEvent.change(purposeField, { target: { value: "Edited purpose for confirm" } });

    fireEvent.click(screen.getByRole("button", { name: "Confirm generation plan" }));

    await waitFor(() => {
      expect(confirmGenerationPlan).toHaveBeenCalledWith(
        baseStatus.id,
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({ purpose: "Edited purpose for confirm" }),
          ]),
        }),
      );
    });

    expect(onConfirmed).toHaveBeenCalledOnce();
  });

  it("prevents double submission while confirming", async () => {
    let resolveConfirm: ((value: string) => void) | undefined;
    vi.mocked(confirmGenerationPlan).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    render(
      <GenerationPlanReview status={baseStatus} onConfirmed={() => undefined} onCancelled={() => undefined} />,
    );

    const confirmButton = screen.getByRole("button", { name: "Confirm generation plan" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm generation plan" })).toBeDisabled();
    });

    expect(confirmGenerationPlan).toHaveBeenCalledTimes(1);

    resolveConfirm?.("Generating");
  });

  it("calls cancel endpoint when cancelling generation", async () => {
    const onCancelled = vi.fn();

    render(<GenerationPlanReview status={baseStatus} onConfirmed={() => undefined} onCancelled={onCancelled} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel generation" }));

    await waitFor(() => {
      expect(cancelGeneration).toHaveBeenCalledWith(baseStatus.id);
    });

    expect(onCancelled).toHaveBeenCalledOnce();
  });

  it("hides editing controls in read-only mode", () => {
    render(
      <GenerationPlanReview
        status={{
          ...baseStatus,
          featureFlags: { enableGenerationPlanEditing: false },
        }}
        onConfirmed={() => undefined}
        onCancelled={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "Reset Changes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm generation plan" })).toBeInTheDocument();
    expect(screen.queryAllByLabelText("Purpose")).toHaveLength(0);
  });

  it("exposes accessible labels for editable fields", () => {
    render(
      <GenerationPlanReview status={baseStatus} onConfirmed={() => undefined} onCancelled={() => undefined} />,
    );

    expect(screen.getAllByLabelText("Purpose").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Accessibility notes").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Responsive strategy")).toBeInTheDocument();
    expect(screen.getByLabelText("Accessibility strategy")).toBeInTheDocument();
  });
});
