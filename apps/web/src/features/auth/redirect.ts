import type { Location } from "react-router-dom";

export function resolveRedirectPath(state: unknown): string {
  if (!state || typeof state !== "object" || !("from" in state)) {
    return "/";
  }

  const from = (state as { from?: unknown }).from;

  if (typeof from === "string" && from.startsWith("/")) {
    return from;
  }

  if (from && typeof from === "object" && "pathname" in from) {
    const location = from as Pick<Location, "pathname" | "search" | "hash">;
    return `${location.pathname ?? "/"}${location.search ?? ""}${location.hash ?? ""}`;
  }

  return "/";
}
