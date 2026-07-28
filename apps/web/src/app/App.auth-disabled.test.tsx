import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import * as generationHistory from "../features/generation-history/useGenerationHistory";

vi.mock("../features/auth/authMode", () => ({
  getAuthMode: () => "disabled" as const,
  isAuthDisabled: () => true,
  getDemoUser: () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "demo@reactify.local",
    displayName: "Demo User",
    createdAt: new Date(0).toISOString(),
  }),
}));

vi.mock("../features/jobs", () => ({
  JobStatus: () => null,
  useJob: () => ({ job: null, refresh: vi.fn() }),
  useGenerationJobs: () => ({ jobs: [], reload: vi.fn() }),
  useJobStore: (selector: (state: { activeJobId: string | null; reset: () => void }) => unknown) =>
    selector({ activeJobId: null, reset: vi.fn() }),
}));

describe("App auth disabled", () => {
  beforeEach(() => {
    vi.spyOn(generationHistory, "useGenerationHistory").mockReturnValue({
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
    });
  });

  it("opens the new generation workspace without sign-in UI", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Reactify" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Upload screenshot" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/i)).not.toBeInTheDocument();
  });
});
