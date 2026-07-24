import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useAuthStore } from "../features/auth/authStore";

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

vi.mock("../features/auth/authApi", () => ({
  fetchSession: vi.fn().mockResolvedValue({
    authenticated: true,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      displayName: "Test User",
      createdAt: new Date().toISOString(),
    },
  }),
}));

describe("App", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "user@example.com",
        displayName: "Test User",
        createdAt: new Date().toISOString(),
      },
      sessionExpiresAt: null,
      isInitialized: true,
      isLoading: false,
    });
  });

  it("renders the Reactify history screen with upload UI", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Reactify" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload screenshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project history" })).toBeInTheDocument();
  });
});
