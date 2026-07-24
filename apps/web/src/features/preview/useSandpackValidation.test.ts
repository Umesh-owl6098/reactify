import { describe, expect, it, vi } from "vitest";
import { submitSandboxValidation } from "../../lib/generation-api";
import {
  buildSandboxValidationRequest,
  performRuntimeValidation,
  submitValidationReportOnce,
} from "./useSandpackValidation";

vi.mock("../../lib/generation-api", () => ({
  submitSandboxValidation: vi.fn(),
}));

describe("useSandpackValidation helpers", () => {
  it("builds normalized sandbox validation requests", () => {
    const request = buildSandboxValidationRequest({
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      projectHash: "abc123",
      compilation: {
        success: true,
        durationMs: 10,
        errors: [],
        warnings: [],
      },
      runtime: {
        success: true,
        durationMs: 20,
        errors: [],
        warnings: [],
      },
    });

    expect(request.projectHash).toBe("abc123");
    expect(request.compilation.success).toBe(true);
  });

  it("performs runtime validation with visible output", async () => {
    const result = await performRuntimeValidation({
      waitForIdle: async () => true,
      readConsoleEvents: () => [],
      hasVisibleOutput: () => true,
      timeoutMs: 500,
    });

    expect(result.success).toBe(true);
  });

  it("prevents duplicate submission", async () => {
    const result = await submitValidationReportOnce({
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      projectHash: "abc123",
      compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
      alreadySubmitted: true,
    });

    expect(result.ok).toBe(true);
    expect(submitSandboxValidation).not.toHaveBeenCalled();
  });
});
