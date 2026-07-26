import { describe, expect, it } from "vitest";
import {
  ExportRequestSchema,
  ExportSummarySchema,
} from "@reactify/generation-contracts";
import { JobAcceptedResponseSchema } from "@reactify/shared";
import {
  formatExportErrorMessage,
  GenerationApiRequestError,
} from "./generation-api";

describe("export API helpers", () => {
  it("accepts the MockLandingPage export request body", () => {
    const payload = ExportRequestSchema.parse({
      projectName: "MockLandingPage",
      includeMetadata: true,
      includeGenerationSummary: false,
    });

    expect(payload.projectName).toBe("MockLandingPage");
    expect(payload.includeMetadata).toBe(true);
    expect(payload.includeGenerationSummary).toBe(false);
  });

  it("formats backend export errors for the UI", () => {
    const error = new GenerationApiRequestError(
      "package.json dependencies are invalid.",
      "PROJECT_INTEGRITY_FAILED",
    );

    expect(formatExportErrorMessage(error)).toBe(
      "Export failed: package.json dependencies are invalid.",
    );
  });

  it("parses async export responses with background jobs", () => {
    const summary = ExportSummarySchema.parse({
      exportId: "880e8400-e29b-41d4-a716-446655440000",
      status: "preparing",
      filename: "mocklandingpage-v1.zip",
      projectName: "mocklandingpage",
      generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
      versionId: "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101",
      versionNumber: 1,
      projectHash: "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101",
      fileCount: 0,
      totalSizeBytes: 0,
      createdAt: new Date().toISOString(),
    });
    const job = JobAcceptedResponseSchema.parse({
      jobId: "11111111-1111-4111-8111-111111111111",
      generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
      jobType: "export_preparation",
      status: "queued",
      createdAt: new Date().toISOString(),
      statusUrl: "/api/v1/jobs/11111111-1111-4111-8111-111111111111",
    });

    expect(summary.status).toBe("preparing");
    expect(job.jobId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("parses ready export summaries returned by the API", () => {
    const summary = ExportSummarySchema.parse({
      exportId: "880e8400-e29b-41d4-a716-446655440000",
      status: "ready",
      filename: "mocklandingpage-v1.zip",
      projectName: "mocklandingpage",
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      versionId: "257386c023077c444e39640a47c176b3fd245a6b2656f6e22e984de045f218dc",
      versionNumber: 1,
      projectHash: "257386c023077c444e39640a47c176b3fd245a6b2656f6e22e984de045f218dc",
      fileCount: 8,
      totalSizeBytes: 1827,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    expect(summary.status).toBe("ready");
    expect(summary.filename).toBe("mocklandingpage-v1.zip");
  });
});
