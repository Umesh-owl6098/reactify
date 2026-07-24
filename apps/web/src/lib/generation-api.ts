import {
  CancelGenerationResponseSchema,
  ConfirmPlanRequestSchema,
  ConfirmPlanResponseSchema,
  CreateGenerationResponseSchema,
  GeneratedFileContentResponseSchema,
  GeneratedFileListResponseSchema,
  GenerationPlanV1Schema,
  DeleteGenerationResponseSchema,
  GenerationListResponseSchema,
  GenerationStatusResponseSchema,
  SandboxValidationRequestSchema,
  SandboxValidationResponseSchema,
  RepairRetryResponseSchema,
  RepairHistoryListResponseSchema,
  RepairAttemptDetailResponseSchema,
  ExportRequestSchema,
  ExportSummarySchema,
  ExportHistoryListResponseSchema,
  ExportDetailResponseSchema,
  EditOperationSummarySchema,
  EditHistoryListResponseSchema,
  EditDetailResponseSchema,
  NaturalLanguageEditRequestSchema,
  EditClarificationRequestSchema,
  EditConfirmationRequestSchema,
  VisualComparisonHistoryListResponseSchema,
  VisualComparisonRequestSchema,
  VisualComparisonResultSchema,
  VisualCorrectionRequestSchema,
  PreviewScreenshotSubmissionSchema,
  type GenerationPlanV1,
  type GenerationStatusResponse,
  type DeleteGenerationResponse,
  type GenerationListResponse,
  type SandboxValidationRequest,
  type ExportRequest,
  type NaturalLanguageEditRequest,
  type EditClarificationRequest,
  type EditConfirmationRequest,
  type VisualComparisonRequest,
  type PreviewScreenshotSubmission,
  type VisualCorrectionRequest,
} from "@reactify/generation-contracts";
import { type APIErrorBody } from "@reactify/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class GenerationApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GenerationApiRequestError";
  }
}

function parseGenerationApiError(responseText: string, fallbackMessage: string): GenerationApiRequestError {
  try {
    const body = JSON.parse(responseText) as APIErrorBody;
    if (body.error?.message) {
      return new GenerationApiRequestError(body.error.message, body.error.code);
    }
  } catch {
    // fall through
  }

  return new GenerationApiRequestError(fallbackMessage);
}

export function formatExportErrorMessage(error: unknown): string {
  if (error instanceof GenerationApiRequestError) {
    return error.code ? `Export failed: ${error.message}` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Export failed.";
}

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
    throw new GenerationApiRequestError("Failed to fetch generation status.");
  }

  return GenerationStatusResponseSchema.parse(await response.json());
}

export async function fetchGenerationList(input: {
  status?: string;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
} = {}): Promise<GenerationListResponse> {
  const params = new URLSearchParams();
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.offset !== undefined) {
    params.set("offset", String(input.offset));
  }
  if (input.order) {
    params.set("order", input.order);
  }

  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/v1/generations${query ? `?${query}` : ""}`);

  if (!response.ok) {
    throw new GenerationApiRequestError("Failed to load generation history.");
  }

  return GenerationListResponseSchema.parse(await response.json());
}

export async function deleteGeneration(generationId: string): Promise<DeleteGenerationResponse> {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new GenerationApiRequestError("Failed to delete generation.");
  }

  return DeleteGenerationResponseSchema.parse(await response.json());
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

export async function createProjectExport(generationId: string, request: ExportRequest) {
  const payload = ExportRequestSchema.parse(request);
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/exports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw parseGenerationApiError(await response.text(), "Failed to create project export.");
  }

  return ExportSummarySchema.parse(await response.json());
}

export async function fetchExportHistory(generationId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/exports`);
  if (!response.ok) {
    throw new Error("Failed to fetch export history.");
  }
  return ExportHistoryListResponseSchema.parse(await response.json());
}

export async function fetchExportDetail(generationId: string, exportId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/exports/${exportId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch export detail.");
  }
  return ExportDetailResponseSchema.parse(await response.json());
}

export async function downloadProjectExport(generationId: string, exportId: string, filename: string) {
  const response = await fetch(
    `${API_BASE}/api/v1/generations/${generationId}/exports/${exportId}/download`,
  );
  if (!response.ok) {
    throw parseGenerationApiError(await response.text(), "Failed to download project export.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function createProjectEdit(generationId: string, request: NaturalLanguageEditRequest) {
  const payload = NaturalLanguageEditRequestSchema.parse(request);
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/edits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Failed to create project edit.");
  }
  return EditOperationSummarySchema.parse(await response.json());
}

export async function fetchEditHistory(generationId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/edits`);
  if (!response.ok) {
    throw new Error("Failed to fetch edit history.");
  }
  return EditHistoryListResponseSchema.parse(await response.json());
}

export async function fetchEditDetail(generationId: string, editId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/edits/${editId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch edit detail.");
  }
  return EditDetailResponseSchema.parse(await response.json());
}

export async function submitEditClarification(
  generationId: string,
  editId: string,
  request: EditClarificationRequest,
) {
  const payload = EditClarificationRequestSchema.parse(request);
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/edits/${editId}/clarification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to submit edit clarification.");
  }
  return EditOperationSummarySchema.parse(await response.json());
}

export async function confirmProjectEdit(
  generationId: string,
  editId: string,
  request: EditConfirmationRequest,
) {
  const payload = EditConfirmationRequestSchema.parse(request);
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/edits/${editId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to confirm project edit.");
  }
  return EditOperationSummarySchema.parse(await response.json());
}

export async function createVisualComparison(generationId: string, request: VisualComparisonRequest) {
  const payload = VisualComparisonRequestSchema.parse(request);
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/visual-comparisons`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Failed to create visual comparison.");
  }
  return VisualComparisonResultSchema.parse(await response.json());
}

export async function submitVisualComparisonScreenshot(
  generationId: string,
  comparisonId: string,
  submission: PreviewScreenshotSubmission,
) {
  const payload = PreviewScreenshotSubmissionSchema.parse(submission);
  const response = await fetch(
    `${API_BASE}/api/v1/generations/${generationId}/visual-comparisons/${comparisonId}/screenshot`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Failed to submit preview screenshot.");
  }
  return VisualComparisonResultSchema.parse(await response.json());
}

export async function fetchVisualComparisonHistory(generationId: string) {
  const response = await fetch(`${API_BASE}/api/v1/generations/${generationId}/visual-comparisons`);
  if (!response.ok) {
    throw new Error("Failed to fetch visual comparison history.");
  }
  return VisualComparisonHistoryListResponseSchema.parse(await response.json());
}

export async function applyVisualCorrection(
  generationId: string,
  comparisonId: string,
  request: VisualCorrectionRequest,
) {
  const payload = VisualCorrectionRequestSchema.parse(request);
  const response = await fetch(
    `${API_BASE}/api/v1/generations/${generationId}/visual-comparisons/${comparisonId}/correct`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Failed to apply visual correction.");
  }
  return VisualComparisonResultSchema.parse(await response.json());
}
