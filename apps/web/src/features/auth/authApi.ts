import {
  ActiveSessionListResponseSchema,
  AuthenticatedUserSchema,
  ChangePasswordRequestSchema,
  RegisterRequestSchema,
  SessionResponseSchema,
  SignInRequestSchema,
  UpdateProfileRequestSchema,
  type ActiveSessionListResponse,
  type AuthenticatedUser,
  type ChangePasswordRequest,
  type RegisterRequest,
  type SessionResponse,
  type SignInRequest,
  type UpdateProfileRequest,
} from "@reactify/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function parseAuthResponse<T>(response: Response, fallbackMessage: string, parser: (data: unknown) => T): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw parseHttpAuthError(response.status, text, fallbackMessage);
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new AuthApiError(fallbackMessage);
  }

  try {
    return parser(data);
  } catch (error) {
    if (error instanceof AuthApiError) {
      throw error;
    }
    throw new AuthApiError(fallbackMessage);
  }
}

function parseHttpAuthError(status: number, text: string, fallbackMessage: string): AuthApiError {
  if (!text.trim()) {
    return new AuthApiError(fallbackMessage, undefined, undefined);
  }

  try {
    const body = JSON.parse(text) as {
      error?: { code?: string; message?: string; fieldErrors?: Record<string, string> };
    };
    return new AuthApiError(body.error?.message ?? fallbackMessage, body.error?.code, body.error?.fieldErrors);
  } catch {
    return new AuthApiError(fallbackMessage);
  }
}

function parseSessionResponse(data: unknown): SessionResponse {
  if (typeof data !== "object" || data === null) {
    throw new AuthApiError("Failed to load session.");
  }

  const record = data as Record<string, unknown>;
  if (record.authenticated === false) {
    return { authenticated: false };
  }

  const parsed = SessionResponseSchema.safeParse(data);
  if (!parsed.success || !parsed.data.authenticated || !parsed.data.user) {
    throw new AuthApiError("Failed to load session.");
  }

  return parsed.data;
}

export async function fetchSession(): Promise<SessionResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1/auth/session`, {
      credentials: "include",
    });
  } catch {
    throw new AuthApiError("Failed to load session.");
  }

  return parseAuthResponse(response, "Failed to load session.", parseSessionResponse);
}

export async function registerAccount(input: RegisterRequest): Promise<{ user: AuthenticatedUser; sessionExpiresAt?: string }> {
  const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(RegisterRequestSchema.parse(input)),
  });
  return parseAuthResponse(response, "Registration failed.", (data) => {
    const parsed = data as { user: unknown; sessionExpiresAt?: string };
    return {
      user: AuthenticatedUserSchema.parse(parsed.user),
      sessionExpiresAt: parsed.sessionExpiresAt,
    };
  });
}

export async function signInAccount(input: SignInRequest): Promise<{ user: AuthenticatedUser; sessionExpiresAt?: string }> {
  const response = await fetch(`${API_BASE}/api/v1/auth/sign-in`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(SignInRequestSchema.parse(input)),
  });
  return parseAuthResponse(response, "Invalid email or password.", (data) => {
    const parsed = data as { user: unknown; sessionExpiresAt?: string };
    return {
      user: AuthenticatedUserSchema.parse(parsed.user),
      sessionExpiresAt: parsed.sessionExpiresAt,
    };
  });
}

export async function signOutAccount(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/auth/sign-out`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new AuthApiError("Sign out failed.");
  }
}

export async function updateProfile(input: UpdateProfileRequest): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_BASE}/api/v1/account/profile`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(UpdateProfileRequestSchema.parse(input)),
  });
  return parseAuthResponse(response, "Profile update failed.", (data) =>
    AuthenticatedUserSchema.parse((data as { user: unknown }).user),
  );
}

export async function changePassword(input: ChangePasswordRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/account/change-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ChangePasswordRequestSchema.parse(input)),
  });
  await parseAuthResponse(response, "Password change failed.", () => undefined);
}

export async function fetchActiveSessions(): Promise<ActiveSessionListResponse> {
  const response = await fetch(`${API_BASE}/api/v1/account/sessions`, {
    credentials: "include",
  });
  return parseAuthResponse(response, "Failed to load sessions.", (data) => ActiveSessionListResponseSchema.parse(data));
}

export async function revokeSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/account/sessions/${sessionId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new AuthApiError("Failed to revoke session.");
  }
}
