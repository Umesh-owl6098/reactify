import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../features/generation/useGeneration", () => ({
  useGeneration: () => ({
    generationId: null,
    status: null,
    error: null,
    isPolling: false,
    beginGeneration: vi.fn(),
    reset: vi.fn(),
  }),
}));

describe("App", () => {
  it("renders the Reactify landing screen with upload and pipeline UI", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Reactify" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload screenshot" })).toBeInTheDocument();
  });
});
