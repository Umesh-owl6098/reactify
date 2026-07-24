import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GenerationDetailErrorBoundary } from "./GenerationDetailErrorBoundary";

function BrokenPanel(): never {
  throw new Error("Panel crashed");
}

describe("GenerationDetailErrorBoundary", () => {
  it("catches child render errors and shows retry actions", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <GenerationDetailErrorBoundary generationId="49189210-714d-431d-ac1c-1554c8cf4c74" onRetry={vi.fn()}>
          <BrokenPanel />
        </GenerationDetailErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText("Reactify could not display this generation.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to history" })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  });
});
