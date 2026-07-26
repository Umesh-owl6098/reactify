import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import * as authApi from "./authApi";
import { useAuthStore } from "./authStore";
import { resetInitialSessionRestoreFlag } from "./session-restore";

describe("ProtectedRoute session handling", () => {
  beforeEach(() => {
    resetInitialSessionRestoreFlag();
    useAuthStore.setState({
      user: null,
      sessionExpiresAt: null,
      isInitialized: false,
      isLoading: false,
      sessionStatus: "unknown",
      sessionError: null,
    });
    vi.restoreAllMocks();
  });

  it("redirects to sign-in for HTTP 200 authenticated:false without showing a session failure", async () => {
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
    expect(screen.queryByText("Failed to load session.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry session check" })).not.toBeInTheDocument();
    expect(useAuthStore.getState().sessionStatus).toBe("unauthenticated");
    expect(useAuthStore.getState().sessionError).toBeNull();
  });

  it("shows the retry UI only for request failures", async () => {
    vi.spyOn(authApi, "fetchSession").mockRejectedValue(new authApi.AuthApiError("Failed to load session."));

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

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load session.");
    expect(screen.getByRole("button", { name: "Retry session check" })).toBeInTheDocument();
    expect(useAuthStore.getState().sessionStatus).toBe("error");
  });

  it("clears stale session errors after a later successful unauthenticated response", async () => {
    const fetchSession = vi
      .spyOn(authApi, "fetchSession")
      .mockRejectedValueOnce(new authApi.AuthApiError("Failed to load session."))
      .mockResolvedValueOnce({ authenticated: false });

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

    expect(await screen.findByRole("button", { name: "Retry session check" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Retry session check" }));

    await waitFor(() => {
      expect(fetchSession).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Sign in page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry session check" })).not.toBeInTheDocument();
    expect(useAuthStore.getState().sessionStatus).toBe("unauthenticated");
    expect(useAuthStore.getState().sessionError).toBeNull();
  });
});
