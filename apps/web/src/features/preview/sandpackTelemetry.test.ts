import { describe, expect, it } from "vitest";
import { isSandpackBundlerUrl, isSandpackTelemetryUrl } from "./sandpackTelemetry";

describe("sandpackTelemetry", () => {
  it("treats col.csbops.io as telemetry rather than runtime traffic", () => {
    expect(isSandpackTelemetryUrl("https://col.csbops.io/data/sandpack")).toBe(true);
    expect(isSandpackBundlerUrl("https://col.csbops.io/data/sandpack")).toBe(false);
  });

  it("recognizes sandpack bundler hosts separately from telemetry", () => {
    expect(isSandpackBundlerUrl("https://sandpack-bundler.codesandbox.io")).toBe(true);
    expect(isSandpackTelemetryUrl("https://sandpack-bundler.codesandbox.io")).toBe(false);
  });
});
