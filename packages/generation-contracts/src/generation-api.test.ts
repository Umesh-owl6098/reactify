import { describe, expect, it } from "vitest";
import { GenerationErrorSchema } from "./generation-api.js";

describe("GenerationErrorSchema", () => {
  it("remains compatible with legacy generation errors", () => {
    expect(
      GenerationErrorSchema.parse({
        stage: "design_analysis",
        code: "AI_TIMEOUT",
        message: "The provider timed out.",
      }),
    ).toMatchObject({ code: "AI_TIMEOUT" });
  });

  it("accepts bounded safe terminal metadata", () => {
    const result = GenerationErrorSchema.parse({
      stage: "react_project_generation",
      code: "GENERATED_PROJECT_SCHEMA_INVALID",
      message: "Generated project response failed schema validation.",
      provider: "openai",
      model: "gpt-test",
      httpStatus: 422,
      providerRequestId: "req-safe-123",
      retryable: false,
      validationIssues: [
        {
          path: "files.0.path",
          code: "invalid_type",
          message: "Expected string.",
        },
      ],
    });

    expect(result.validationIssues).toHaveLength(1);
    expect(result.providerRequestId).toBe("req-safe-123");
  });

  it("rejects unbounded validation issue collections", () => {
    const result = GenerationErrorSchema.safeParse({
      stage: "design_analysis",
      code: "ANALYSIS_SCHEMA_INVALID",
      message: "Invalid response.",
      validationIssues: Array.from({ length: 9 }, () => ({
        path: "layout",
        code: "invalid",
        message: "Invalid field.",
      })),
    });

    expect(result.success).toBe(false);
  });
});
