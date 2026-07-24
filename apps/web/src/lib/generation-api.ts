import {
  CancelGenerationResponseSchema,
  ConfirmPlanRequestSchema,
  ConfirmPlanResponseSchema,
  CreateGenerationResponseSchema,
  GenerationPlanV1Schema,
  GenerationStatusResponseSchema,
  type GenerationPlanV1,
  type GenerationStatusResponse,
} from "@reactify/generation-contracts";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const TERMINAL_STATUSES = new Set(["Ready", "Failed", "Cancelled"]);

export function isTerminalGenerationStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isAwaitingPlanReview(status: GenerationStatusResponse): boolean {
  return status.status === "Planning" && status.awaitingPlanConfirmation;
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

export async function confirmGenerationPlan(
  generationId: string,
  plan: GenerationPlanV1,
): Promise<string> {
  const payload = ConfirmPlanRequestSchema.parse({ plan: GenerationPlanV1Schema.parse(plan) });

  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/confirm-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to confirm generation plan.");
  }

  const body = ConfirmPlanResponseSchema.parse(await response.json());
  return body.status;
}

export async function cancelGeneration(generationId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to cancel generation.");
  }

  CancelGenerationResponseSchema.parse(await response.json());
}
