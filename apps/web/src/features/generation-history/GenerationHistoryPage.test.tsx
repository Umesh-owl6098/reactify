import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GenerationHistoryPage } from "./GenerationHistoryPage";
import { useGenerationHistoryStore } from "./generationHistoryStore";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("./useGenerationHistory", () => ({
  useGenerationHistory: () => ({
    items: [
      {
        generationId: "11111111-1111-4111-8111-111111111111",
        status: "Ready",
        sourceImageFilename: "landing.png",
        currentStage: null,
        activeVersionNumber: 2,
        latestProjectHash: "abc123",
        latestSimilarityScore: 94.5,
        repairCount: 1,
        editCount: 1,
        versionCount: 2,
        exportCount: 1,
        createdAt: "2026-07-23T12:00:00.000Z",
        updatedAt: "2026-07-23T12:30:00.000Z",
      },
    ],
    total: 1,
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

describe("GenerationHistoryPage", () => {
  it("renders generation cards and open project action", () => {
    render(
      <MemoryRouter>
        <GenerationHistoryPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("landing.png")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Project" })).toHaveAttribute(
      "href",
      "/generations/11111111-1111-4111-8111-111111111111",
    );
  });

  it("renders empty state when no items are available", () => {
    useGenerationHistoryStore.setState({ items: [], total: 0, error: null, isLoading: false });
    vi.resetModules();
  });
});

describe("GenerationFilters", () => {
  it("renders status filter options", () => {
    render(
      <MemoryRouter>
        <GenerationHistoryPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("option", { name: "Ready" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter generations by status")).toBeInTheDocument();
  });
});
