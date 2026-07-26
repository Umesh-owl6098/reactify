import { describe, expect, it } from "vitest";
import { detectDifferenceRegions, type RegionDetectionOptions } from "./regionDetector.js";

const options: RegionDetectionOptions = {
  noiseThreshold: 24,
  mergeDistance: 8,
  maxRegions: 12,
  minRegionSize: 16,
};

const WIDTH = 320;
const HEIGHT = 240;

function blankDiff(): Buffer {
  return Buffer.alloc(WIDTH * HEIGHT * 4);
}

function paint(diff: Buffer, x: number, y: number, width: number, height: number): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * WIDTH + column) * 4;
      diff[offset] = 255;
      diff[offset + 1] = 0;
      diff[offset + 2] = 0;
      diff[offset + 3] = 255;
    }
  }
}

/** Thin scattered outlines, the shape anti-aliasing produces. */
function paintSparseOutlines(diff: Buffer): void {
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      if (column % 24 !== 0 && row % 24 !== 0) {
        continue;
      }
      const offset = (row * WIDTH + column) * 4;
      diff[offset] = 255;
      diff[offset + 3] = 255;
    }
  }
}

describe("detectDifferenceRegions", () => {
  it("reports nothing for an unchanged image", () => {
    expect(detectDifferenceRegions(blankDiff(), WIDTH, HEIGHT, options)).toEqual([]);
  });

  it("bounds a region to the area that actually changed", () => {
    const diff = blankDiff();
    paint(diff, 64, 48, 96, 72);

    const regions = detectDifferenceRegions(diff, WIDTH, HEIGHT, options);
    expect(regions).toHaveLength(1);

    const bounds = regions[0]!.bounds;
    expect(bounds.x).toBeLessThanOrEqual(64);
    expect(bounds.y).toBeLessThanOrEqual(48);
    expect(bounds.width).toBeLessThan(WIDTH / 2);
    expect(bounds.height).toBeLessThan(HEIGHT / 2);
  });

  it("keeps separated changes as separate regions", () => {
    const diff = blankDiff();
    paint(diff, 8, 8, 48, 48);
    paint(diff, 240, 170, 48, 48);

    const regions = detectDifferenceRegions(diff, WIDTH, HEIGHT, options);
    expect(regions).toHaveLength(2);
  });

  it("does not turn a sparse web of outlines into one canvas-sized region", () => {
    const regions = detectDifferenceRegions(
      (() => {
        const diff = blankDiff();
        paintSparseOutlines(diff);
        return diff;
      })(),
      WIDTH,
      HEIGHT,
      options,
    );

    const canvasSized = regions.filter(
      (region) => region.bounds.width >= WIDTH * 0.9 && region.bounds.height >= HEIGHT * 0.9,
    );
    expect(canvasSized).toEqual([]);
  });

  it("only calls a difference high severity when it covers a real share of the canvas", () => {
    const small = blankDiff();
    paint(small, 8, 8, 32, 32);
    expect(detectDifferenceRegions(small, WIDTH, HEIGHT, options)[0]!.severity).not.toBe("high");

    const large = blankDiff();
    paint(large, 0, 0, WIDTH, Math.round(HEIGHT * 0.6));
    expect(detectDifferenceRegions(large, WIDTH, HEIGHT, options)[0]!.severity).toBe("high");
  });

  it("is deterministic", () => {
    const diff = blankDiff();
    paint(diff, 32, 32, 64, 64);
    paint(diff, 200, 140, 80, 60);

    expect(detectDifferenceRegions(diff, WIDTH, HEIGHT, options)).toEqual(
      detectDifferenceRegions(diff, WIDTH, HEIGHT, options),
    );
  });
});
