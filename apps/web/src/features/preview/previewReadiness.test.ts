import { describe, expect, it, vi } from "vitest";
import { evaluatePreviewReadiness, isDocumentHeightRendered, type PreviewSignals } from "./previewReadiness";
import { applyBundlerMessage } from "./SandpackConnectionMonitor";
import { DEFAULT_SANDPACK_BUNDLER_URL, getSandpackBundlerUrl } from "./sandpackConfig";
import { isSandpackTelemetryUrl } from "./sandpackTelemetry";

function signals(overrides: Partial<PreviewSignals> = {}): PreviewSignals {
  return {
    filesLoaded: true,
    providerMounted: true,
    bundlerConnected: true,
    compilationSucceeded: true,
    runtimeSucceeded: true,
    iframeLoaded: true,
    domRendered: true,
    fatalRuntimeError: null,
    ...overrides,
  };
}

describe("evaluatePreviewReadiness", () => {
  it("is ready only when every signal is satisfied", () => {
    expect(evaluatePreviewReadiness(signals())).toEqual({ ready: true, reason: null });
  });

  it("does not report ready when the preview rendered no visible content", () => {
    const readiness = evaluatePreviewReadiness(signals({ domRendered: false }));

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toMatch(/no visible content/i);
  });

  it("does not report ready when the iframe never loaded", () => {
    const readiness = evaluatePreviewReadiness(signals({ iframeLoaded: false, domRendered: false }));

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toMatch(/iframe/i);
  });

  it("surfaces a fatal runtime error ahead of every other reason", () => {
    const readiness = evaluatePreviewReadiness(signals({ fatalRuntimeError: "TypeError: boom" }));

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("TypeError: boom");
  });

  it("reports the first unmet prerequisite in dependency order", () => {
    const readiness = evaluatePreviewReadiness(
      signals({ filesLoaded: false, bundlerConnected: false, domRendered: false }),
    );

    expect(readiness.reason).toMatch(/files/i);
  });
});

describe("isDocumentHeightRendered", () => {
  it("treats an empty document as not rendered", () => {
    expect(isDocumentHeightRendered(0)).toBe(false);
    expect(isDocumentHeightRendered(8)).toBe(false);
    expect(isDocumentHeightRendered(null)).toBe(false);
  });

  it("treats a painted document as rendered", () => {
    expect(isDocumentHeightRendered(810)).toBe(true);
  });
});

describe("applyBundlerMessage", () => {
  function harness() {
    const setPreviewSignals = vi.fn();
    const markConnected = vi.fn();
    return { setPreviewSignals, markConnected, handlers: { setPreviewSignals, markConnected } };
  }

  it("marks compilation successful when the bundler finishes without errors", () => {
    const { handlers, setPreviewSignals } = harness();

    applyBundlerMessage({ type: "done", compilatonError: false }, handlers);

    expect(setPreviewSignals).toHaveBeenCalledWith(
      expect.objectContaining({ compilationSucceeded: true, runtimeSucceeded: true }),
    );
  });

  it("marks compilation failed when the bundler reports a compile error", () => {
    const { handlers, setPreviewSignals } = harness();

    applyBundlerMessage({ type: "done", compilatonError: true }, handlers);

    expect(setPreviewSignals).toHaveBeenCalledWith(
      expect.objectContaining({ compilationSucceeded: false, runtimeSucceeded: false }),
    );
  });

  it("derives domRendered from the reported document height", () => {
    const { handlers, setPreviewSignals } = harness();

    applyBundlerMessage({ type: "resize", height: 0 }, handlers);
    expect(setPreviewSignals).toHaveBeenLastCalledWith({ documentHeight: 0, domRendered: false });

    applyBundlerMessage({ type: "resize", height: 1024 }, handlers);
    expect(setPreviewSignals).toHaveBeenLastCalledWith({ documentHeight: 1024, domRendered: true });
  });

  it("records a fatal runtime error from show-error actions", () => {
    const { handlers, setPreviewSignals } = harness();

    applyBundlerMessage({ type: "action", action: "show-error", message: "boom" }, handlers);

    expect(setPreviewSignals).toHaveBeenCalledWith({ fatalRuntimeError: "boom", runtimeSucceeded: false });
  });

  it("ignores unrelated bundler chatter", () => {
    const { handlers, setPreviewSignals, markConnected } = harness();

    applyBundlerMessage({ type: "console" }, handlers);
    applyBundlerMessage({ type: "urlchange" }, handlers);

    expect(setPreviewSignals).not.toHaveBeenCalled();
    expect(markConnected).not.toHaveBeenCalled();
  });
});

describe("sandpack telemetry vs runtime traffic", () => {
  it("classifies col.csbops.io as telemetry, not the bundler", () => {
    expect(isSandpackTelemetryUrl("https://col.csbops.io/data/sandpack")).toBe(true);
    expect(isSandpackTelemetryUrl(DEFAULT_SANDPACK_BUNDLER_URL)).toBe(false);
  });

  it("falls back to the hosted bundler when no override is configured", () => {
    expect(getSandpackBundlerUrl()).toBe(DEFAULT_SANDPACK_BUNDLER_URL);
  });
});
