import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, fetchSession } from "./authApi";

const testUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.com",
  displayName: "Test User",
  createdAt: new Date().toISOString(),
};

function mockFetchResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns authenticated sessions from HTTP 200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse(200, {
          authenticated: true,
          user: testUser,
          sessionExpiresAt: "2026-12-31T00:00:00.000Z",
        }),
      ),
    );

    await expect(fetchSession()).resolves.toEqual({
      authenticated: true,
      user: testUser,
      sessionExpiresAt: "2026-12-31T00:00:00.000Z",
    });
  });

  it("treats HTTP 200 authenticated:false as a valid logged-out session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(200, { authenticated: false })));

    await expect(fetchSession()).resolves.toEqual({ authenticated: false });
  });

  it("treats HTTP 200 authenticated:false with null user as logged-out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(200, { authenticated: false, user: null })),
    );

    await expect(fetchSession()).resolves.toEqual({ authenticated: false });
  });

  it("throws for HTTP 401 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse(401, {
          error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
        }),
      ),
    );

    await expect(fetchSession()).rejects.toMatchObject({
      message: "Authentication is required.",
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("throws for HTTP 500 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse(500, {
          error: { code: "INTERNAL_ERROR", message: "Unexpected server failure." },
        }),
      ),
    );

    await expect(fetchSession()).rejects.toMatchObject({
      message: "Unexpected server failure.",
      code: "INTERNAL_ERROR",
    });
  });

  it("throws for network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchSession()).rejects.toBeInstanceOf(AuthApiError);
    await expect(fetchSession()).rejects.toMatchObject({ message: "Failed to load session." });
  });

  it("throws for malformed JSON bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{", { status: 200 })));

    await expect(fetchSession()).rejects.toMatchObject({ message: "Failed to load session." });
  });
});
