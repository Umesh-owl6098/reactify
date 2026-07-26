import { describe, expect, it } from "vitest";
import { resolveComparisonViewport } from "./resolveComparisonViewport.js";

const DESKTOP = { width: 1440, height: 810, deviceScaleFactor: 1 };

describe("resolveComparisonViewport", () => {
  it("derives the height from the real source aspect ratio", () => {
    // The DeviceFramesShowcase upload is 2000x1111, which is not 16:9.
    expect(resolveComparisonViewport(DESKTOP, { width: 2000, height: 1111 })).toEqual({
      width: 1440,
      height: 800,
      deviceScaleFactor: 1,
    });
  });

  it("keeps the requested viewport when the source is already 16:9", () => {
    expect(resolveComparisonViewport(DESKTOP, { width: 1920, height: 1080 })).toEqual(DESKTOP);
  });

  it("keeps the requested viewport when source dimensions are unknown", () => {
    expect(resolveComparisonViewport(DESKTOP, null)).toEqual(DESKTOP);
  });

  it("keeps the requested viewport for degenerate source dimensions", () => {
    expect(resolveComparisonViewport(DESKTOP, { width: 0, height: 0 })).toEqual(DESKTOP);
  });

  it("matches a tall source", () => {
    expect(resolveComparisonViewport({ width: 390, height: 844 }, { width: 1000, height: 2000 })).toEqual({
      width: 390,
      height: 780,
      deviceScaleFactor: 1,
    });
  });

  it("refuses a derived height outside supported bounds", () => {
    // An extremely wide panorama would collapse to an unusable viewport.
    expect(resolveComparisonViewport(DESKTOP, { width: 20000, height: 200 })).toEqual(DESKTOP);
  });

  it("preserves the requested device scale factor", () => {
    expect(
      resolveComparisonViewport({ width: 1440, height: 810, deviceScaleFactor: 2 }, { width: 2000, height: 1111 }),
    ).toEqual({ width: 1440, height: 800, deviceScaleFactor: 2 });
  });
});
