import { DEFAULT_DEMO_USER, type AuthMode, type AuthenticatedUser } from "@reactify/shared";

export function getAuthMode(): AuthMode {
  const mode = import.meta.env.VITE_AUTH_MODE;
  return mode === "session" ? "session" : "disabled";
}

export function isAuthDisabled(): boolean {
  return getAuthMode() === "disabled";
}

export function getDemoUser(): AuthenticatedUser {
  return {
    id: DEFAULT_DEMO_USER.id,
    email: DEFAULT_DEMO_USER.email,
    displayName: DEFAULT_DEMO_USER.displayName,
    createdAt: new Date(0).toISOString(),
  };
}
