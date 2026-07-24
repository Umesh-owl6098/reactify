import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RegisterPage } from "./RegisterPage";
import { SignInPage } from "./SignInPage";
import { ProtectedRoute } from "./ProtectedRoute";
import * as authApi from "./authApi";
import { useAuthStore } from "./authStore";

describe("auth UI", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      sessionExpiresAt: null,
      isInitialized: true,
      isLoading: false,
    });
    vi.restoreAllMocks();
  });

  it("validates password confirmation on registration", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "different-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/passwords do not match/i);
  });

  it("redirects after successful registration", async () => {
    vi.spyOn(authApi, "registerAccount").mockResolvedValue({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "user@example.com",
        displayName: "Test User",
        createdAt: new Date().toISOString(),
      },
    });

    render(
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });

  it("shows invalid-credentials error on sign-in failure", async () => {
    vi.spyOn(authApi, "signInAccount").mockRejectedValue(
      Object.assign(new authApi.AuthApiError("Invalid email or password."), { code: "INVALID_CREDENTIALS" }),
    );

    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
  });

  it("redirects unauthenticated users from protected routes", async () => {
    vi.spyOn(authApi, "fetchSession").mockResolvedValue({ authenticated: false });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/sign-in" element={<div>Sign in page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sign in page")).toBeInTheDocument();
  });

  it("does not store tokens in browser storage", async () => {
    vi.spyOn(authApi, "registerAccount").mockResolvedValue({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "user@example.com",
        displayName: "Test User",
        createdAt: new Date().toISOString(),
      },
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(localStorage.getItem("reactify_session")).toBeNull();
      expect(sessionStorage.getItem("reactify_session")).toBeNull();
    });
  });
});
