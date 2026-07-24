import {
  AiEstimateResponseSchema,
  UsageAccountResponseSchema,
  UsageOperationListResponseSchema,
  type AiEstimateRequest,
  type AiEstimateResponse,
  type UsageAccountResponse,
  type UsageOperationListResponse,
} from "@reactify/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function parseJson<T>(response: Response, parser: (data: unknown) => T): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
    throw new Error(body.error?.message ?? "Request failed");
  }
  return parser(JSON.parse(text));
}

export async function fetchAccountUsage(): Promise<UsageAccountResponse> {
  const response = await fetch(`${API_BASE}/api/v1/account/usage`, { credentials: "include" });
  return parseJson(response, (data) => UsageAccountResponseSchema.parse(data));
}

export async function fetchUsageOperations(query: {
  operationType?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<UsageOperationListResponse> {
  const params = new URLSearchParams();
  if (query.operationType) params.set("operationType", query.operationType);
  if (query.status) params.set("status", query.status);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));

  const response = await fetch(`${API_BASE}/api/v1/account/usage/operations?${params.toString()}`, {
    credentials: "include",
  });
  return parseJson(response, (data) => UsageOperationListResponseSchema.parse(data));
}

export async function fetchAiEstimate(
  generationId: string,
  body: AiEstimateRequest,
): Promise<AiEstimateResponse> {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/ai-estimate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, (data) => AiEstimateResponseSchema.parse(data));
}
