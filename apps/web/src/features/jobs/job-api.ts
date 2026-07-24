import { JobListResponseSchema, JobStatusResponseSchema, type JobStatusResponse } from "@reactify/shared";
import { type APIErrorBody } from "@reactify/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function jobFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${input}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await jobFetch(`/api/v1/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error("Unable to fetch job status.");
  }
  return JobStatusResponseSchema.parse(await response.json());
}

export async function fetchGenerationJobs(generationId: string) {
  const response = await jobFetch(`/api/v1/generations/${generationId}/jobs?limit=20&order=desc`);
  if (!response.ok) {
    throw new Error("Unable to fetch generation jobs.");
  }
  return JobListResponseSchema.parse(await response.json());
}

export async function cancelJob(jobId: string): Promise<JobStatusResponse> {
  const response = await jobFetch(`/api/v1/jobs/${jobId}/cancel`, { method: "POST" });
  if (!response.ok) {
    const body = (await response.json()) as APIErrorBody;
    throw new Error(body.error?.message ?? "Unable to cancel job.");
  }
  return JobStatusResponseSchema.parse(await response.json());
}

export async function retryJob(jobId: string): Promise<{ jobId: string; statusUrl: string }> {
  const response = await jobFetch(`/api/v1/jobs/${jobId}/retry`, { method: "POST" });
  if (!response.ok) {
    const body = (await response.json()) as APIErrorBody;
    throw new Error(body.error?.message ?? "Unable to retry job.");
  }
  return response.json() as Promise<{ jobId: string; statusUrl: string }>;
}

export function isTerminalJobStatus(status: JobStatusResponse["status"]): boolean {
  return ["completed", "failed", "cancelled", "dead_letter"].includes(status);
}

export function isActiveJobStatus(status: JobStatusResponse["status"]): boolean {
  return ["queued", "claimed", "running", "retry_scheduled"].includes(status);
}
