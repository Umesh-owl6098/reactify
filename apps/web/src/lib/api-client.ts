import { type APIErrorBody } from "@reactify/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function parseApiError(responseText: string, fallbackMessage: string, status?: number): ApiRequestError {
  if (!responseText.trim()) {
    if (status === 401) {
      return new ApiRequestError("Authentication is required.", "AUTHENTICATION_REQUIRED", status);
    }
    if (status === 503 || status === 502 || status === 504) {
      return new ApiRequestError("The API server is unavailable.", "DATABASE_UNAVAILABLE", status);
    }
    return new ApiRequestError(fallbackMessage, undefined, status);
  }

  try {
    const body = JSON.parse(responseText) as APIErrorBody;
    if (body.error?.message) {
      return new ApiRequestError(body.error.message, body.error.code, status);
    }
  } catch {
    // fall through
  }

  return new ApiRequestError(fallbackMessage, undefined, status);
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${input}`, {
    ...init,
    credentials: "include",
  });
}

export async function apiJson<T>(
  input: string,
  init?: RequestInit,
  fallbackMessage = "Request failed.",
): Promise<T> {
  const response = await apiFetch(input, init);
  if (!response.ok) {
    throw parseApiError(await response.text(), fallbackMessage, response.status);
  }
  return response.json() as Promise<T>;
}
