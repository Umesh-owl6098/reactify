import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobProgress } from "./JobProgress.js";

describe("JobProgress", () => {
  it("renders running progress with accessible progressbar", () => {
    render(
      <JobProgress
        job={{
          jobId: "11111111-1111-4111-8111-111111111111",
          generationId: "22222222-2222-4222-8222-222222222222",
          jobType: "design_analysis",
          status: "running",
          progress: 60,
          progressMessage: "Analyzing your screenshot",
          attemptNumber: 1,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          completedAt: null,
          failureCode: null,
          failureMessage: null,
          cancellationAllowed: true,
        }}
      />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText("Analyzing your screenshot")).toBeInTheDocument();
  });
});
