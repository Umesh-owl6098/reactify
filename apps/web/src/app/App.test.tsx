import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../features/generation-history/useGenerationHistory", () => ({
  useGenerationHistory: () => ({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
    statusFilter: "",
    isLoading: false,
    error: null,
    setPagination: vi.fn(),
    setStatusFilter: vi.fn(),
    reload: vi.fn(),
  }),
}));

describe("App", () => {
  it("renders the Reactify history screen with upload UI", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Reactify" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload screenshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project history" })).toBeInTheDocument();
  });
});
