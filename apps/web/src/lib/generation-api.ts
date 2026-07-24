import {
  CancelGenerationResponseSchema,
  ConfirmPlanRequestSchema,
  ConfirmPlanResponseSchema,
  CreateGenerationResponseSchema,
  GeneratedFileContentResponseSchema,
  GeneratedFileListResponseSchema,
  GenerationPlanV1Schema,
  GenerationStatusResponseSchema,
  SandboxValidationRequestSchema,
  SandboxValidationResponseSchema,
  RepairRetryResponseSchema,
  RepairHistoryListResponseSchema,
  RepairAttemptDetailResponseSchema,
  type GenerationPlanV1,
  type GenerationStatusResponse,
  type SandboxValidationRequest,
} from "@reactify/generation-contracts";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const TERMINAL_STATUSES = new Set(["Ready", "Failed", "Cancelled", "RepairRequired", "RepairFailed"]);

export function isTerminalGenerationStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isAwaitingPlanReview(status: GenerationStatusResponse): boolean {
  return status.status === "Planning" && status.awaitingPlanConfirmation;
}

export function isAwaitingSandboxValidation(status: GenerationStatusResponse): boolean {
  return status.awaitingSandboxValidation && Boolean(status.projectHash);
}

export async function submitSandboxValidation(
  generationId: string,
  report: SandboxValidationRequest,
): Promise<string> {
  const payload = SandboxValidationRequestSchema.parse(report);

  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/sandbox-validation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to submit sandbox validation report.");
  }

  const body = SandboxValidationResponseSchema.parse(await response.json());
  return body.status;
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

export async function fetchGeneratedProjectFiles(generationId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/files`);

  if (!response.ok) {
    throw new Error("Failed to fetch generated project files.");
  }

  return GeneratedFileListResponseSchema.parse(await response.json());
}

export async function fetchGeneratedFileContent(generationId: string, path: string) {
  const query = new URLSearchParams({ path });
  const response = await fetch(
    `${API_BASE}/api/v1/generations/${generationId}/files/content?${query.toString()}`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch generated file content.");
  }

  return GeneratedFileContentResponseSchema.parse(await response.json());
}

export function shouldShowGeneratedProject(status: GenerationStatusResponse): boolean {
  return Boolean(status.outputs.generatedProject) &&
    ["Generating", "Validating", "Compiling", "Repairing", "RepairRequired", "RepairFailed", "Ready", "Failed"].includes(status.status);
}

export async function fetchRepairHistory(generationId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/repairs`);
  if (!response.ok) {
    throw new Error("Failed to fetch repair history.");
  }
  return RepairHistoryListResponseSchema.parse(await response.json());
}

export async function fetchRepairAttempt(generationId: string, attemptNumber: number) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/repairs/${attemptNumber}`);
  if (!response.ok) {
    throw new Error("Failed to fetch repair attempt.");
  }
  return RepairAttemptDetailResponseSchema.parse(await response.json());
}

export async function retryRepair(generationId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/repairs/retry`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to retry repair.");
  }
  return RepairRetryResponseSchema.parse(await response.json()).status;
}
