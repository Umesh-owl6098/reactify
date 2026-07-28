import { DEFAULT_DEMO_USER, DEFAULT_DEMO_USER_ID, type AuthMode } from "@reactify/shared";
import type { Env } from "../env.js";
import type { AuthenticatedRequestContext } from "./types.js";
import { toAuthenticatedUser } from "./types.js";

export function isAuthDisabled(env: Env): boolean {
  return env.AUTH_MODE === "disabled";
}

export function getDefaultDemoUserId(env: Env): string {
  return env.DEFAULT_DEMO_USER_ID ?? DEFAULT_DEMO_USER_ID;
}

export function createDisabledAuthContext(env: Env): AuthenticatedRequestContext {
  const userId = getDefaultDemoUserId(env);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  return {
    user: {
      id: userId,
      email: DEFAULT_DEMO_USER.email,
      displayName: DEFAULT_DEMO_USER.displayName,
      createdAt: new Date(0).toISOString(),
      status: "active",
    },
    session: {
      sessionId: "00000000-0000-4000-8000-000000000001",
      expiresAt,
    },
  };
}

export function disabledSessionResponse(env: Env) {
  const context = createDisabledAuthContext(env);
  return {
    authenticated: true as const,
    user: toAuthenticatedUser(context.user),
    sessionExpiresAt: context.session.expiresAt.toISOString(),
  };
}

export function resolveAuthMode(value: string | undefined): AuthMode {
  return value === "disabled" ? "disabled" : "session";
}
