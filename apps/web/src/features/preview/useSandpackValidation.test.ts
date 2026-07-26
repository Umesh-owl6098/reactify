import { describe, expect, it, vi } from "vitest";
import { submitSandboxValidation } from "../../lib/generation-api";
import {
  buildCompilationValidationResult,
  buildSandboxValidationRequest,
  isSandpackCompilationReady,
  performRuntimeValidation,
  submitValidationReportOnce,
  waitForSandpackCompilation,
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

  it("treats Sandpack running without errors as compilation-ready", () => {
    expect(isSandpackCompilationReady("running", false)).toBe(true);
    expect(isSandpackCompilationReady("idle", false)).toBe(true);
    expect(isSandpackCompilationReady("initial", false)).toBe(false);
  });

  it("waits for running Sandpack status without timing out at 30 seconds", async () => {
    vi.useFakeTimers();
    let status = "initial";

    const waitPromise = waitForSandpackCompilation({
      readStatus: () => status,
      readHasError: () => false,
      readError: () => null,
      hardTimeoutMs: 30_000,
      pollIntervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(500);
    status = "running";
    await vi.advanceTimersByTimeAsync(30_000);

    const result = await waitPromise;
    expect(result.ready).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.finalStatus).toBe("running");

    vi.useRealTimers();
  });

  it("does not treat running status as failure when building compilation results", () => {
    const compilation = buildCompilationValidationResult({
      ready: true,
      timedOut: false,
      durationMs: 30_352,
      finalStatus: "running",
      error: null,
    });

    expect(compilation.success).toBe(true);
    expect(compilation.errors).toHaveLength(0);
  });

  it("submits compile failures only for actual Sandpack errors", () => {
    const compilation = buildCompilationValidationResult({
      ready: false,
      timedOut: false,
      durationMs: 120,
      finalStatus: "idle",
      error: {
        message: "Syntax error",
        severity: "error",
        source: "sandpack",
        fileName: "src/App.tsx",
      },
    });

    expect(compilation.success).toBe(false);
    expect(compilation.errors[0]?.message).toContain("Syntax error");
  });

  it("uses a compilation-timeout diagnostic for hard timeouts", () => {
    const compilation = buildCompilationValidationResult({
      ready: false,
      timedOut: true,
      durationMs: 120_000,
      finalStatus: "initial",
      error: null,
      hardTimeoutMs: 120_000,
    });

    expect(compilation.success).toBe(false);
    expect(compilation.errors[0]?.code).toBe("SANDBOX_COMPILATION_TIMEOUT");
    expect(compilation.errors[0]?.category).toBe("compilation-timeout");
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
