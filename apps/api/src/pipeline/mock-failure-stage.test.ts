import { describe, expect, it } from "vitest";
import { resolveMockFailureStage } from "./mock-failure-stage.js";

describe("resolveMockFailureStage", () => {
  it("allows explicit failure injection in tests", () => {
    expect(resolveMockFailureStage("design_analysis", "test")).toBe("design_analysis");
  });

  it("ignores mock failure injection outside test environments", () => {
    expect(resolveMockFailureStage("design_analysis", "production")).toBeUndefined();
    expect(resolveMockFailureStage("design_analysis", "development")).toBeUndefined();
  });
});
import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import {
  createMockFailureMessage,
  isLegacyForcedFailureError,
  resolveMockFailureStage,
} from "./mock-failure-stage.js";

describe("resolveMockFailureStage", () => {
  it("returns undefined when the env var is absent", () => {
    expect(resolveMockFailureStage(undefined)).toBeUndefined();
  });

  it("returns undefined when the env var is empty", () => {
    expect(resolveMockFailureStage("")).toBeUndefined();
    expect(resolveMockFailureStage("   ")).toBeUndefined();
  });

  it("returns the stage when explicitly configured", () => {
    expect(resolveMockFailureStage("design_analysis")).toBe("design_analysis");
  });

  it("ignores invalid stage names", () => {
    expect(resolveMockFailureStage("not-a-stage")).toBeUndefined();
  });
});

describe("createMockFailureMessage", () => {
  it("formats the injected failure message", () => {
    expect(createMockFailureMessage("design_analysis")).toBe("Forced failure at design_analysis");
  });
});

describe("isLegacyForcedFailureError", () => {
  it("detects legacy INTERNAL_ERROR forced failures", () => {
    expect(
      isLegacyForcedFailureError(ErrorCode.INTERNAL_ERROR, "Forced failure at design_analysis"),
    ).toBe(true);
  });

  it("does not match unrelated internal errors", () => {
    expect(isLegacyForcedFailureError(ErrorCode.INTERNAL_ERROR, "Unexpected crash")).toBe(false);
  });
});
