import { describe, expect, it } from "vitest";
import { ExportPreparationJobPayloadSchema, VisualCorrectionJobPayloadSchema } from "./jobs.js";

const projectHashVersionId = "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101";

describe("export job payload schema", () => {
  it("accepts project hash version ids", () => {
    const payload = ExportPreparationJobPayloadSchema.parse({
      generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
      exportId: "880e8400-e29b-41d4-a716-446655440000",
      versionId: projectHashVersionId,
      expectedProjectHash: projectHashVersionId,
      projectName: "MockLandingPage",
      includeMetadata: true,
      includeGenerationSummary: false,
    });

    expect(payload.versionId).toBe(projectHashVersionId);
  });

  it("rejects empty version ids", () => {
    const result = ExportPreparationJobPayloadSchema.safeParse({
      generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
      exportId: "880e8400-e29b-41d4-a716-446655440000",
      versionId: "",
      expectedProjectHash: projectHashVersionId,
    });

    expect(result.success).toBe(false);
  });

  it("accepts project hash version ids for visual correction jobs", () => {
    const payload = VisualCorrectionJobPayloadSchema.parse({
      generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
      comparisonId: "880e8400-e29b-41d4-a716-446655440000",
      versionId: projectHashVersionId,
      expectedProjectHash: projectHashVersionId,
    });

    expect(payload.versionId).toBe(projectHashVersionId);
  });
});
