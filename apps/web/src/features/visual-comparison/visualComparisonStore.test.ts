import { describe, expect, it } from "vitest";
import { VIEWPORT_DIMENSIONS, viewportForAspectRatio } from "./visualComparisonStore";

describe("viewportForAspectRatio", () => {
  it("uses 1440x810 for 16:9 source images on desktop", () => {
    expect(viewportForAspectRatio(512, 288, "desktop")).toEqual(VIEWPORT_DIMENSIONS.desktop);
    expect(VIEWPORT_DIMENSIONS.desktop).toEqual({ width: 1440, height: 810, deviceScaleFactor: 1 });
  });
});
