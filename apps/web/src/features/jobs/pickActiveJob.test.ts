import { describe, expect, it } from "vitest";
import type { JobStatusResponse } from "@reactify/shared";
import { pickActiveJob } from "./pickActiveJob.js";

function job(
  overrides: Partial<JobStatusResponse> & Pick<JobStatusResponse, "jobId" | "jobType" | "status">,
): JobStatusResponse {
  return {
    generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
    progress: 100,
    progressMessage: null,
    attemptNumber: 1,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    failureCode: null,
    failureMessage: null,
    cancellationAllowed: false,
    ...overrides,
  };
}

describe("pickActiveJob", () => {
  it("returns null for terminal Ready generations even when legacy jobs are waiting_for_client", () => {
    const active = pickActiveJob(
      [
        job({
          jobId: "ceef5e27-de64-4bae-8f18-1801dbc3c994",
          jobType: "react_project_generation",
          status: "waiting_for_client",
          progressMessage: "Awaiting browser validation",
        }),
      ],
      { status: "Ready" },
    );

    expect(active).toBeNull();
  });

  it("prefers the plan confirmation job while awaiting plan review", () => {
    const active = pickActiveJob(
      [
        job({
          jobId: "11111111-1111-4111-8111-111111111111",
          jobType: "design_analysis",
          status: "completed",
        }),
        job({
          jobId: "22222222-2222-4222-8222-222222222222",
          jobType: "generation_plan_creation",
          status: "waiting_for_client",
        }),
      ],
      { status: "Planning", awaitingPlanConfirmation: true },
    );

    expect(active?.jobType).toBe("generation_plan_creation");
  });

  it("prefers the react project job while awaiting sandbox validation", () => {
    const active = pickActiveJob(
      [
        job({
          jobId: "22222222-2222-4222-8222-222222222222",
          jobType: "generation_plan_creation",
          status: "waiting_for_client",
        }),
        job({
          jobId: "33333333-3333-4333-8333-333333333333",
          jobType: "react_project_generation",
          status: "waiting_for_client",
        }),
      ],
      { status: "Compiling", awaitingSandboxValidation: true },
    );

    expect(active?.jobType).toBe("react_project_generation");
  });

  it("selects running design analysis jobs for analyzing generations", () => {
    const active = pickActiveJob(
      [
        job({
          jobId: "44444444-4444-4444-8444-444444444444",
          jobType: "design_analysis",
          status: "running",
          progress: 60,
        }),
      ],
      { status: "Analyzing" },
    );

    expect(active?.jobType).toBe("design_analysis");
    expect(active?.progress).toBe(60);
  });
});
