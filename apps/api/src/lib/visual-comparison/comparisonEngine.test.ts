import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { runVisualComparison } from "./comparisonEngine.js";
import { normalizeImage } from "./imageNormalizer.js";
import { testEnv } from "../../test/helpers.js";

async function createSolidPng(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe("normalizeImage", () => {
  it("preserves aspect ratio and produces deterministic dimensions", async () => {
    const source = await createSolidPng(800, 600, { r: 255, g: 0, b: 0 });
    const first = await normalizeImage(source, 400, 400);
    const second = await normalizeImage(source, 400, 400);
    expect(first.width).toBe(400);
    expect(first.height).toBe(400);
    expect(first.png.equals(second.png)).toBe(true);
  });
});

describe("runVisualComparison", () => {
  it("reports near-perfect similarity for identical images", async () => {
    const image = await createSolidPng(200, 200, { r: 10, g: 20, b: 30 });
    const result = await runVisualComparison(image, image, { width: 200, height: 200 }, testEnv);
    expect(result.overallSimilarityScore).toBeGreaterThan(99);
    expect(result.pixelDifferencePercentage).toBeLessThan(1);
    expect(result.regions.length).toBeLessThanOrEqual(1);
  });

  it("detects color and layout differences deterministically", async () => {
    const source = await createSolidPng(200, 200, { r: 255, g: 255, b: 255 });
    const preview = await createSolidPng(200, 200, { r: 0, g: 0, b: 255 });
    const first = await runVisualComparison(source, preview, { width: 200, height: 200 }, testEnv);
    const second = await runVisualComparison(source, preview, { width: 200, height: 200 }, testEnv);
    expect(first.overallSimilarityScore).toBeLessThan(90);
    expect(first.regions.length).toBeGreaterThan(0);
    expect(first.overallSimilarityScore).toBe(second.overallSimilarityScore);
    expect(first.pixelDifferencePercentage).toBe(second.pixelDifferencePercentage);
  });
});
