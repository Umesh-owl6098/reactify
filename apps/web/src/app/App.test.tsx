import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useAuthStore } from "../features/auth/authStore";
import { resetInitialSessionRestoreFlag } from "../features/auth/session-restore";

vi.mock("../features/auth/authMode", () => ({
  getAuthMode: () => "session" as const,
  isAuthDisabled: () => false,
  getDemoUser: () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "demo@reactify.local",
    displayName: "Demo User",
    createdAt: new Date(0).toISOString(),
  }),
}));

import { createMockGenerationHistory } from "../test/mockGenerationHistory";

vi.mock("../features/generation-history/useGenerationHistory", () => ({
  useGenerationHistory: () => createMockGenerationHistory(),
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
    resetInitialSessionRestoreFlag();
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
      sessionStatus: "authenticated",
      sessionError: null,
    });
  });

  it("renders the Reactify history screen with upload UI", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Reactify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New generation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload screenshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project history" })).toBeInTheDocument();
  });
});
