import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { isGenerationStatusForRoute } from "./generation-route";

export type GenerationWorkspaceView =
  | "upload"
  | "auth-waiting"
  | "loading"
  | "error"
  | "unexpected-empty"
  | "ready";

export function resolveGenerationWorkspaceView(input: {
  generationId?: string;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  status: GenerationStatusResponse | null;
}): GenerationWorkspaceView {
  if (!input.generationId) {
    return "upload";
  }

  if (!input.isInitialized || !input.isAuthenticated) {
    return "auth-waiting";
  }

  const routeStatus = isGenerationStatusForRoute(input.status, input.generationId)
    ? input.status
    : null;
  const isRouteLoading = Boolean(
    input.isLoading || (input.status && !routeStatus),
  );

  if (isRouteLoading && !routeStatus) {
    return "loading";
  }

  if (input.error && !routeStatus) {
    return "error";
  }

  if (!routeStatus && !input.error && !isRouteLoading) {
    return "unexpected-empty";
  }

  return "ready";
}

export function getRouteGenerationStatus(
  status: GenerationStatusResponse | null | undefined,
  generationId: string | undefined,
): GenerationStatusResponse | null {
  if (!status || !generationId || status.id !== generationId) {
    return null;
  }

  return status;
}
