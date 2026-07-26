export type SessionStatus = "unknown" | "loading" | "authenticated" | "unauthenticated" | "error";

export function isSessionLoading(status: SessionStatus, isInitialized: boolean): boolean {
  return !isInitialized || status === "unknown" || status === "loading";
}

export function isSessionFailure(status: SessionStatus): boolean {
  return status === "error";
}
