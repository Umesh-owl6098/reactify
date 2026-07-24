import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UsagePage } from "./UsagePage";

vi.mock("./useUsage", () => ({
  useUsage: () => ({
    accountUsage: {
      summary: {
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-08-01T00:00:00.000Z",
        inputTokens: 1200,
        outputTokens: 800,
        totalTokens: 2000,
        estimatedCostUsd: 0.5,
        actualCostUsd: 0.42,
        operationCount: 2,
        failedOperationCount: 0,
        remainingBudgetUsd: 9.5,
        remainingTokenAllowance: null,
      },
      limits: {
        allowed: true,
        monthlyBudgetUsd: 10,
        usedBudgetUsd: 0.42,
        reservedBudgetUsd: 0.08,
        remainingBudgetUsd: 9.5,
        monthlyTokenLimit: null,
        usedTokens: 2000,
        reservedTokens: 100,
        remainingTokens: null,
        nextResetAt: "2026-08-01T00:00:00.000Z",
      },
    },
    operations: {
      total: 1,
      limit: 20,
      offset: 0,
      items: [
        {
          usageId: "11111111-1111-4111-8111-111111111111",
          operationType: "design_analysis",
          provider: "mock",
          model: "claude-3-5-sonnet-20241022",
          status: "reconciled",
          estimatedInputTokens: 1000,
          estimatedOutputTokens: 500,
          actualInputTokens: 900,
          actualOutputTokens: 450,
          estimatedCostUsd: 0.2,
          actualCostUsd: 0.18,
          createdAt: "2026-07-10T12:00:00.000Z",
        },
      ],
    },
    loading: false,
    error: null,
  }),
}));

vi.mock("../auth/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../layout/AppHeader", () => ({
  AppHeader: () => <div>Header</div>,
}));

describe("UsagePage", () => {
  it("renders usage summary, progress, operations, and account navigation", () => {
    render(
      <MemoryRouter>
        <UsagePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByText("Current billing period")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Monthly AI budget usage" })).toBeInTheDocument();
    expect(screen.getByText("Recent AI operations")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByText("Next reset")).toBeInTheDocument();
  });
});
