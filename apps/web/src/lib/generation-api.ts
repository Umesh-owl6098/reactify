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
  VisualComparisonDetailResponseSchema,
  VisualComparisonRequestSchema,
  VisualComparisonResultSchema,
  VisualCorrectionRequestSchema,
  PreviewScreenshotSubmissionSchema,
  ProjectVersionListResponseSchema,
  RollbackVersionResponseSchema,
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
import { type APIErrorBody, JobAcceptedResponseSchema, JobStatusResponseSchema } from "@reactify/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${input}`, {
    ...init,
    credentials: "include",
  });
}

export class GenerationApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GenerationApiRequestError";
  }
}

function parseGenerationApiError(
  responseText: string,
  fallbackMessage: string,
  status?: number,
): GenerationApiRequestError {
  if (!responseText.trim()) {
    if (status === 401) {
      return new GenerationApiRequestError("Authentication is required.", "AUTHENTICATION_REQUIRED", status);
    }
    if (status === 404) {
      return new GenerationApiRequestError("Generation not found.", "GENERATION_NOT_FOUND", status);
    }
    if (status === 503 || status === 502 || status === 504) {
      return new GenerationApiRequestError("The API server is unavailable.", "DATABASE_UNAVAILABLE", status);
    }
    return new GenerationApiRequestError(fallbackMessage, undefined, status);
  }

  try {
    const body = JSON.parse(responseText) as APIErrorBody;
    if (body.error?.message) {
      return new GenerationApiRequestError(body.error.message, body.error.code, status);
    }
  } catch {
    // fall through
  }

  return new GenerationApiRequestError(fallbackMessage, undefined, status);
}

export function mapGenerationLoadError(error: unknown, fallbackMessage: string): string {
  if (error instanceof GenerationApiRequestError) {
    if (error.code === "AUTHENTICATION_REQUIRED" || error.status === 401) {
      return "Your session has expired. Sign in again to view this generation.";
    }
    if (error.code === "GENERATION_NOT_FOUND" || error.status === 404) {
      return "Generation not found.";
    }
    if (error.code === "GENERATION_DATA_INVALID") {
      return "Persisted generation data is invalid.";
    }
    if (
      error.code === "DATABASE_UNAVAILABLE" ||
      error.status === 503 ||
      error.status === 502 ||
      error.status === 504
    ) {
      return "The API server is unavailable.";
    }
    if (error.status && error.status >= 500) {
      return "Unexpected loading error.";
    }
    return error.message || fallbackMessage;
  }

  if (error instanceof Error && error.name === "ZodError") {
    return "Persisted generation data is invalid.";
  }

  return fallbackMessage;
}

export function formatDownloadErrorMessage(error: unknown): string {
  if (error instanceof GenerationApiRequestError) {
    return `Download failed: ${error.message}`;
  }

  if (error instanceof Error) {
    return `Download failed: ${error.message}`;
  }

  return "Download failed.";
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

  console.info("[sandpack] validation_post_started", {
    generationId,
    projectHash: payload.projectHash,
    compilationSuccess: payload.compilation.success,
    runtimeSuccess: payload.runtime.success,
  });

  const response = await apiFetch(`/api/v1/generations/${generationId}/sandbox-validation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.info("[sandpack] validation_post_finished", {
      generationId,
      ok: false,
      status: response.status,
    });
    throw parseGenerationApiError(
      errorText,
      "Failed to submit sandbox validation report.",
      response.status,
    );
  }

  const body = SandboxValidationResponseSchema.parse(await response.json());
  console.info("[sandpack] validation_post_finished", {
    generationId,
    ok: true,
    status: body.status,
  });
  return body.status;
}

export async function startGeneration(imageId: string): Promise<{ generationId: string; jobId?: string }> {
  const response = await apiFetch(`/api/v1/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageId }),
  });

  if (!response.ok) {
    throw new Error("Failed to start generation.");
  }

  const body = await response.json();
  const parsed = CreateGenerationResponseSchema.parse(body);
  const jobId = body.job ? JobAcceptedResponseSchema.parse(body.job).jobId : undefined;
  return { generationId: parsed.generationId, jobId };
}

export async function retryGeneration(generationId: string): Promise<string> {
  const response = await apiFetch(`/api/v1/generations/${generationId}/retry`, {
    method: "POST",
  });

  if (!response.ok) {
    throw parseGenerationApiError(await response.text(), "Unable to retry generation.", response.status);
  }

  const body = (await response.json()) as { status?: string };
  return body.status ?? "Analyzing";
}

export async function fetchGenerationStatus(
  generationId: string,
): Promise<GenerationStatusResponse> {
  const response = await apiFetch(`/api/v1/generations/${generationId}`);
  const responseText = await response.text();

  if (!response.ok) {
    throw parseGenerationApiError(responseText, "Failed to fetch generation status.", response.status);
  }

  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new GenerationApiRequestError("Failed to fetch generation status.", undefined, response.status);
  }

  const parsed = GenerationStatusResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GenerationApiRequestError("Persisted generation data is invalid.", "GENERATION_DATA_INVALID", response.status);
  }

  return parsed.data;
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
  const response = await apiFetch(`/api/v1/generations${query ? `?${query}` : ""}`);

  if (!response.ok) {
    throw new GenerationApiRequestError("Failed to load generation history.");
  }

  return GenerationListResponseSchema.parse(await response.json());
}

export async function deleteGeneration(generationId: string): Promise<DeleteGenerationResponse> {
  const response = await apiFetch(`/api/v1/generations/${generationId}`, {
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

  const response = await apiFetch(`/api/v1/generations/${generationId}/confirm-plan`, {
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
  const response = await apiFetch(`/api/v1/generations/${generationId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to cancel generation.");
  }

  CancelGenerationResponseSchema.parse(await response.json());
}

export async function fetchGeneratedProjectFiles(generationId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/files`);

  if (!response.ok) {
    throw new Error("Failed to fetch generated project files.");
  }

  return GeneratedFileListResponseSchema.parse(await response.json());
}

export async function fetchGeneratedFileContent(generationId: string, path: string) {
  const query = new URLSearchParams({ path });
  const response = await apiFetch(
    `/api/v1/generations/${generationId}/files/content?${query.toString()}`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch generated file content.");
  }

  return GeneratedFileContentResponseSchema.parse(await response.json());
}

export async function fetchPreviewStylesCss(generationId: string): Promise<string> {
  const response = await apiFetch(`/api/v1/generations/${generationId}/preview-styles.css`);

  if (!response.ok) {
    throw new Error("Failed to fetch compiled preview stylesheet.");
  }

  return response.text();
}

export function shouldShowGeneratedProject(status: GenerationStatusResponse): boolean {
  return Boolean(status.outputs.generatedProject) &&
    ["Generating", "Validating", "Compiling", "Repairing", "RepairRequired", "RepairFailed", "Ready", "Failed"].includes(status.status);
}

export async function fetchRepairHistory(generationId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/repairs`);
  if (!response.ok) {
    throw new Error("Failed to fetch repair history.");
  }
  return RepairHistoryListResponseSchema.parse(await response.json());
}

export async function fetchRepairAttempt(generationId: string, attemptNumber: number) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/repairs/${attemptNumber}`);
  if (!response.ok) {
    throw new Error("Failed to fetch repair attempt.");
  }
  return RepairAttemptDetailResponseSchema.parse(await response.json());
}

export async function retryRepair(generationId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/repairs/retry`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to retry repair.");
  }
  return RepairRetryResponseSchema.parse(await response.json()).status;
}

export async function createProjectExport(generationId: string, request: ExportRequest) {
  const payload = ExportRequestSchema.parse(request);
  const response = await apiFetch(`/api/v1/generations/${generationId}/exports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw parseGenerationApiError(
      await response.text(),
      "Failed to create project export.",
      response.status,
    );
  }

  const body: unknown = await response.json();
  if (body && typeof body === "object" && "export" in body) {
    const wrapped = body as { export: unknown; job?: unknown };
    const job = JobAcceptedResponseSchema.parse(wrapped.job);
    return waitForExportReady(generationId, ExportSummarySchema.parse(wrapped.export).exportId, job.jobId);
  }

  return ExportSummarySchema.parse(body);
}

async function waitForExportReady(
  generationId: string,
  exportId: string,
  jobId?: string,
  timeoutMs = 120_000,
): Promise<ReturnType<typeof ExportSummarySchema.parse>> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const detail = await fetchExportDetail(generationId, exportId);
    if (detail.export.status === "ready" || detail.export.status === "failed") {
      return detail.export;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  const detail = await fetchExportDetail(generationId, exportId);
  if (detail.export.status === "ready" || detail.export.status === "failed") {
    return detail.export;
  }
  if (detail.export.failureReason) {
    throw new Error(detail.export.failureReason);
  }
  if (jobId) {
    const jobResponse = await apiFetch(`/api/v1/jobs/${jobId}`);
    if (jobResponse.ok) {
      const job = JobStatusResponseSchema.parse(await jobResponse.json());
      if (job.failureMessage) {
        throw new Error(`[${job.failureCode ?? "EXPORT_FAILED"}] ${job.failureMessage}`);
      }
      if (job.status === "queued" || job.status === "retry_scheduled") {
        throw new Error(
          `Export worker has not started the job yet (status: ${job.status}). The worker may be starting up — please retry in a moment.`,
        );
      }
      if (job.status === "completed") {
        throw new Error(
          "The export worker completed the job but the export record was not updated. This is a transient DB write failure — please retry the export.",
        );
      }
    }
  }
  throw new Error("Export preparation did not complete before the deadline. Please retry — if this persists, check that the Railway worker service is running.");
}

export async function fetchExportHistory(generationId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/exports`);
  if (!response.ok) {
    throw new Error("Failed to fetch export history.");
  }
  return ExportHistoryListResponseSchema.parse(await response.json());
}

export async function fetchExportDetail(generationId: string, exportId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/exports/${exportId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch export detail.");
  }
  return ExportDetailResponseSchema.parse(await response.json());
}

export async function downloadProjectExport(generationId: string, exportId: string, filename: string) {
  const response = await apiFetch(
    `/api/v1/generations/${generationId}/exports/${exportId}/download`,
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
  const response = await apiFetch(`/api/v1/generations/${generationId}/edits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw parseGenerationApiError(
      await response.text(),
      "Failed to create project edit.",
      response.status,
    );
  }
  // Worker mode replies 202 with { edit, job }; inline mode replies with the
  // bare edit summary. Accept both so async acceptance is not treated as an error.
  const body: unknown = await response.json();
  const summary =
    body !== null && typeof body === "object" && "edit" in body
      ? (body as { edit: unknown }).edit
      : body;
  return EditOperationSummarySchema.parse(summary);
}

export async function fetchEditHistory(generationId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/edits`);
  if (!response.ok) {
    throw new Error("Failed to fetch edit history.");
  }
  return EditHistoryListResponseSchema.parse(await response.json());
}

export async function fetchEditDetail(generationId: string, editId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/edits/${editId}`);
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
  const response = await apiFetch(`/api/v1/generations/${generationId}/edits/${editId}/clarification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw parseGenerationApiError(
      await response.text(),
      "Failed to submit edit clarification.",
      response.status,
    );
  }
  return EditOperationSummarySchema.parse(await response.json());
}

export async function confirmProjectEdit(
  generationId: string,
  editId: string,
  request: EditConfirmationRequest,
) {
  const payload = EditConfirmationRequestSchema.parse(request);
  const response = await apiFetch(`/api/v1/generations/${generationId}/edits/${editId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw parseGenerationApiError(
      await response.text(),
      "Failed to confirm project edit.",
      response.status,
    );
  }
  return EditOperationSummarySchema.parse(await response.json());
}

export async function fetchVersionHistory(generationId: string) {
  const response = await apiFetch(`/api/v1/generations/${generationId}/versions`);
  if (!response.ok) {
    throw parseGenerationApiError(
      await response.text(),
      "Failed to fetch version history.",
      response.status,
    );
  }
  return ProjectVersionListResponseSchema.parse(await response.json());
}

export async function rollbackToVersion(
  generationId: string,
  versionId: string,
  expectedProjectHash: string,
) {
  const response = await apiFetch(
    `/api/v1/generations/${generationId}/versions/${versionId}/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedProjectHash }),
    },
  );
  if (!response.ok) {
    throw parseGenerationApiError(
      await response.text(),
      "Failed to roll back to the selected version.",
      response.status,
    );
  }
  return RollbackVersionResponseSchema.parse(await response.json());
}

export async function createVisualComparison(generationId: string, request: VisualComparisonRequest) {
  const payload = VisualComparisonRequestSchema.parse(request);
  const response = await apiFetch(`/api/v1/generations/${generationId}/visual-comparisons`, {
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
  const response = await apiFetch(
    `/api/v1/generations/${generationId}/visual-comparisons/${comparisonId}/screenshot`,
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
  const response = await apiFetch(`/api/v1/generations/${generationId}/visual-comparisons`);
  if (!response.ok) {
    throw new Error("Failed to fetch visual comparison history.");
  }
  return VisualComparisonHistoryListResponseSchema.parse(await response.json());
}

export async function fetchVisualComparison(generationId: string, comparisonId: string) {
  const response = await apiFetch(
    `/api/v1/generations/${generationId}/visual-comparisons/${comparisonId}`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch visual comparison.");
  }
  return VisualComparisonDetailResponseSchema.parse(await response.json()).comparison;
}

export async function applyVisualCorrection(
  generationId: string,
  comparisonId: string,
  request: VisualCorrectionRequest,
) {
  const payload = VisualCorrectionRequestSchema.parse(request);
  const response = await apiFetch(
    `/api/v1/generations/${generationId}/visual-comparisons/${comparisonId}/correct`,
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
