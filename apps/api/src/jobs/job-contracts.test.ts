import { describe, expect, it } from "vitest";
import { ExportPreparationJobPayloadSchema } from "@reactify/shared";
import { validateJobPayloadForEnqueue } from "./job-contracts.js";

const projectHashVersionId = "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101";

describe("validateJobPayloadForEnqueue", () => {
  it("accepts export preparation payloads with hash version ids", () => {
    const payload = validateJobPayloadForEnqueue("export_preparation", {
      generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
      exportId: "880e8400-e29b-41d4-a716-446655440000",
      versionId: projectHashVersionId,
      expectedProjectHash: projectHashVersionId,
      projectName: "MockLandingPage",
      includeMetadata: true,
      includeGenerationSummary: false,
    });

    expect(ExportPreparationJobPayloadSchema.parse(payload).versionId).toBe(projectHashVersionId);
  });

  it("rejects export preparation payloads with empty version ids", () => {
    expect(() =>
      validateJobPayloadForEnqueue("export_preparation", {
        generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
        exportId: "880e8400-e29b-41d4-a716-446655440000",
        versionId: "",
        expectedProjectHash: projectHashVersionId,
      }),
    ).toThrow("Invalid job payload.");
  });
});
