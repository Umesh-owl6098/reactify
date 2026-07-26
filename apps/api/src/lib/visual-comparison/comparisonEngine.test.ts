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
    expect(first.metadata.padded).toBe(true);
    expect(first.metadata.resizeMode).toBe("contain");
    expect(first.png.equals(second.png)).toBe(true);
  });

  it("upscales same-aspect-ratio images to fill the viewport without padding", async () => {
    const source = await createSolidPng(512, 288, { r: 255, g: 0, b: 0 });
    const normalized = await normalizeImage(source, 1440, 810);

    expect(normalized.width).toBe(1440);
    expect(normalized.height).toBe(810);
    expect(normalized.metadata.padded).toBe(false);
    expect(normalized.metadata.resizeMode).toBe("fill");
    expect(normalized.metadata.normalizedWidth).toBe(1440);
    expect(normalized.metadata.normalizedHeight).toBe(810);

    const { data, info } = await sharp(normalized.png).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(1440);
    expect(info.height).toBe(810);

    const corner = (data[0] ?? 0) + (data[1] ?? 0) + (data[2] ?? 0);
    const centerOffset = (405 * 1440 + 720) * 3;
    const center = (data[centerOffset] ?? 0) + (data[centerOffset + 1] ?? 0) + (data[centerOffset + 2] ?? 0);
    expect(corner).toBeGreaterThan(0);
    expect(center).toBeGreaterThan(0);
    expect(corner).toBe(center);
  });

  it("uses contain padding for mismatched aspect ratios", async () => {
    const source = await createSolidPng(400, 400, { r: 0, g: 255, b: 0 });
    const normalized = await normalizeImage(source, 1440, 810);

    expect(normalized.width).toBe(1440);
    expect(normalized.height).toBe(810);
    expect(normalized.metadata.padded).toBe(true);
    expect(normalized.metadata.resizeMode).toBe("contain");
    expect(normalized.metadata.normalizedWidth).toBeLessThan(1440);
    expect(normalized.metadata.normalizedHeight).toBe(810);
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

  it("bounds regions to the changed area instead of the whole canvas", async () => {
    const source = await createSolidPng(400, 300, { r: 20, g: 40, b: 200 });
    const preview = await sharp(await createSolidPng(400, 300, { r: 20, g: 40, b: 200 }))
      .composite([
        {
          input: await createSolidPng(80, 60, { r: 240, g: 40, b: 40 }),
          left: 40,
          top: 30,
        },
      ])
      .png()
      .toBuffer();

    const result = await runVisualComparison(source, preview, { width: 400, height: 300 }, testEnv);

    expect(result.regions.length).toBeGreaterThan(0);
    for (const region of result.regions) {
      expect(region.bounds.width).toBeLessThan(400);
      expect(region.bounds.height).toBeLessThan(300);
    }
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

  it("matches overlay and diff dimensions to the normalized viewport", async () => {
    const source = await createSolidPng(512, 288, { r: 10, g: 20, b: 30 });
    const preview = await createSolidPng(1440, 810, { r: 10, g: 20, b: 30 });
    const result = await runVisualComparison(source, preview, { width: 1440, height: 810 }, testEnv);

    expect(result.sourceImage).toEqual({ width: 1440, height: 810 });
    expect(result.previewImage).toEqual({ width: 1440, height: 810 });

    const diffMeta = await sharp(result.artifacts.diffPng).metadata();
    const overlayMeta = await sharp(result.artifacts.overlayPng).metadata();
    const regionsMeta = await sharp(result.artifacts.regionsPng).metadata();

    expect(diffMeta.width).toBe(1440);
    expect(diffMeta.height).toBe(810);
    expect(overlayMeta.width).toBe(1440);
    expect(overlayMeta.height).toBe(810);
    expect(regionsMeta.width).toBe(1440);
    expect(regionsMeta.height).toBe(810);
    expect(result.overallSimilarityScore).toBeGreaterThan(99);
  });

  it("emits every artifact at the identical normalized size", async () => {
    const source = await createSolidPng(2000, 1111, { r: 40, g: 90, b: 220 });
    const preview = await createSolidPng(1440, 800, { r: 40, g: 90, b: 220 });
    const result = await runVisualComparison(source, preview, { width: 1440, height: 800 }, testEnv);

    const sizes = await Promise.all(
      [
        result.artifacts.sourcePng,
        result.artifacts.previewPng,
        result.artifacts.diffPng,
        result.artifacts.overlayPng,
        result.artifacts.regionsPng,
      ].map(async (buffer) => {
        const meta = await sharp(buffer).metadata();
        return `${meta.width}x${meta.height}`;
      }),
    );

    expect(new Set(sizes)).toEqual(new Set(["1440x800"]));
  });
});
