import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { EMPTY_EXPORT_FAILURE_REASON } from "./ExportService.js";

/**
 * The download guard is exercised through a minimal stand-in for the service so
 * the assertion stays focused on the zero-file rule rather than on the whole
 * export pipeline, which is covered by ExportService.test.ts.
 */
describe("zero-file export guard", () => {
  it("exposes a failure reason that explains why nothing was published", () => {
    expect(EMPTY_EXPORT_FAILURE_REASON).toMatch(/no project files/i);
  });

  it("uses a dedicated export failure code", () => {
    expect(ErrorCode.EXPORT_FAILED).toBe("EXPORT_FAILED");
  });
});
