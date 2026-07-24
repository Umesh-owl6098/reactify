import {
  CreateGenerationResponseSchema,
  GenerationStatusResponseSchema,
  type GenerationStatusResponse,
} from "@reactify/generation-contracts";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const TERMINAL_STATUSES = new Set(["Ready", "Failed", "Cancelled"]);

export function isTerminalGenerationStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export async function startGeneration(imageId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/v1/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageId }),
  });

  if (!response.ok) {
    throw new Error("Failed to start generation.");
  }

  const body = CreateGenerationResponseSchema.parse(await response.json());
  return body.generationId;
}

export async function fetchGenerationStatus(
  generationId: string,
): Promise<GenerationStatusResponse> {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}`);

  if (!response.ok) {
    throw new Error("Failed to fetch generation status.");
  }

  return GenerationStatusResponseSchema.parse(await response.json());
}
