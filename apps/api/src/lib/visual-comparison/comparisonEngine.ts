import pixelmatch from "pixelmatch";
import sharp from "sharp";
import type { VisualRegionDifference } from "@reactify/generation-contracts";
import type { Env } from "../../env.js";
import { createOverlayImage, createRegionsImage, normalizeImage } from "./imageNormalizer.js";
import { detectDifferenceRegions } from "./regionDetector.js";

/**
 * Scoring formula (deterministic, heuristic):
 *
 * totalPixels = width * height
 * diffPixelCount = pixels flagged different by pixelmatch
 * pixelDifferencePercentage = (diffPixelCount / totalPixels) * 100
 *
 * channelDiff(p) = (|r1-r2| + |g1-g2| + |b1-b2|) / (255 * 3)
 * meanNormalizedPixelDifference = average(channelDiff over all pixels) * 100
 * overallSimilarityScore = clamp(100 - meanNormalizedPixelDifference, 0, 100)
 *
 * structuralDifferenceScore = min(100,
 *   highSeverityRegions * 20 +
 *   mediumSeverityRegions * 10 +
 *   lowSeverityRegions * 3 +
 *   pixelDifferencePercentage * 0.3
 * )
 *
 * These scores are approximate visual heuristics, not perceptually perfect metrics.
 */
export interface ComparisonEngineResult {
  overallSimilarityScore: number;
  pixelDifferencePercentage: number;
  structuralDifferenceScore: number;
  regions: VisualRegionDifference[];
  summary: string;
  correctionRecommended: boolean;
  sourceImage: { width: number; height: number };
  previewImage: { width: number; height: number };
  /**
   * All five artifacts share the normalized comparison dimensions so the UI can
   * overlay them directly without rescaling.
   */
  artifacts: {
    sourcePng: Buffer;
    previewPng: Buffer;
    diffPng: Buffer;
    overlayPng: Buffer;
    regionsPng: Buffer;
  };
}

export async function runVisualComparison(
  sourceBuffer: Buffer,
  previewBuffer: Buffer,
  viewport: { width: number; height: number },
  env: Pick<
    Env,
    | "VISUAL_COMPARISON_NOISE_THRESHOLD"
    | "VISUAL_COMPARISON_REGION_MERGE_DISTANCE"
    | "VISUAL_COMPARISON_MAX_REGIONS"
    | "VISUAL_COMPARISON_MIN_REGION_SIZE"
    | "VISUAL_SIMILARITY_ACCEPTABLE_THRESHOLD"
    | "VISUAL_CORRECTION_RECOMMEND_THRESHOLD"
  >,
): Promise<ComparisonEngineResult> {
  const normalizedSource = await normalizeImage(sourceBuffer, viewport.width, viewport.height);
  const normalizedPreview = await normalizeImage(previewBuffer, viewport.width, viewport.height);

  const matchOptions = {
    threshold: env.VISUAL_COMPARISON_NOISE_THRESHOLD / 255,
    includeAA: false,
  };

  // The reviewable diff keeps a faded copy of the source behind the highlights,
  // which means every pixel in it is opaque. Region detection needs to know
  // which pixels actually changed, so it gets a separate mask where unchanged
  // pixels are transparent.
  const diffRaw = Buffer.alloc(normalizedSource.width * normalizedSource.height * 4);
  const maskRaw = Buffer.alloc(normalizedSource.width * normalizedSource.height * 4);
  const diffPixelCount = pixelmatch(
    normalizedSource.raw,
    normalizedPreview.raw,
    diffRaw,
    normalizedSource.width,
    normalizedSource.height,
    matchOptions,
  );
  pixelmatch(
    normalizedSource.raw,
    normalizedPreview.raw,
    maskRaw,
    normalizedSource.width,
    normalizedSource.height,
    { ...matchOptions, diffMask: true },
  );

  const totalPixels = normalizedSource.width * normalizedSource.height;
  const pixelDifferencePercentage = Number(((diffPixelCount / totalPixels) * 100).toFixed(2));

  let channelDiffSum = 0;
  for (let index = 0; index < normalizedSource.raw.length; index += 4) {
    channelDiffSum +=
      Math.abs((normalizedSource.raw[index] ?? 0) - (normalizedPreview.raw[index] ?? 0)) +
      Math.abs((normalizedSource.raw[index + 1] ?? 0) - (normalizedPreview.raw[index + 1] ?? 0)) +
      Math.abs((normalizedSource.raw[index + 2] ?? 0) - (normalizedPreview.raw[index + 2] ?? 0));
  }
  const meanNormalizedPixelDifference = Number(
    ((channelDiffSum / (totalPixels * 255 * 3)) * 100).toFixed(2),
  );
  const overallSimilarityScore = Number(
    Math.max(0, Math.min(100, 100 - meanNormalizedPixelDifference)).toFixed(2),
  );

  const regions = detectDifferenceRegions(maskRaw, normalizedSource.width, normalizedSource.height, {
    noiseThreshold: env.VISUAL_COMPARISON_NOISE_THRESHOLD,
    mergeDistance: env.VISUAL_COMPARISON_REGION_MERGE_DISTANCE,
    maxRegions: env.VISUAL_COMPARISON_MAX_REGIONS,
    minRegionSize: env.VISUAL_COMPARISON_MIN_REGION_SIZE,
  });

  const highSeverityRegions = regions.filter((region) => region.severity === "high").length;
  const mediumSeverityRegions = regions.filter((region) => region.severity === "medium").length;
  const lowSeverityRegions = regions.filter((region) => region.severity === "low").length;
  const structuralDifferenceScore = Number(
    Math.min(
      100,
      highSeverityRegions * 20 +
        mediumSeverityRegions * 10 +
        lowSeverityRegions * 3 +
        pixelDifferencePercentage * 0.3,
    ).toFixed(2),
  );

  const correctionRecommended =
    overallSimilarityScore < env.VISUAL_CORRECTION_RECOMMEND_THRESHOLD ||
    pixelDifferencePercentage > 100 - env.VISUAL_SIMILARITY_ACCEPTABLE_THRESHOLD;

  const summary =
    overallSimilarityScore >= env.VISUAL_SIMILARITY_ACCEPTABLE_THRESHOLD
      ? `Preview closely matches the source screenshot (${overallSimilarityScore.toFixed(1)}% similarity).`
      : `Preview differs from the source screenshot (${overallSimilarityScore.toFixed(1)}% similarity, ${pixelDifferencePercentage.toFixed(1)}% changed pixels, ${regions.length} notable regions).`;

  const diffPng = await sharp(diffRaw, {
    raw: { width: normalizedSource.width, height: normalizedSource.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const [overlayPng, regionsPng] = await Promise.all([
    createOverlayImage(normalizedPreview.png, diffRaw, normalizedSource.width, normalizedSource.height),
    createRegionsImage(normalizedPreview.png, regions, normalizedSource.width, normalizedSource.height),
  ]);

  return {
    overallSimilarityScore,
    pixelDifferencePercentage,
    structuralDifferenceScore,
    regions,
    summary,
    correctionRecommended,
    sourceImage: {
      width: normalizedSource.width,
      height: normalizedSource.height,
    },
    previewImage: {
      width: normalizedPreview.width,
      height: normalizedPreview.height,
    },
    artifacts: {
      sourcePng: normalizedSource.png,
      previewPng: normalizedPreview.png,
      diffPng,
      overlayPng,
      regionsPng,
    },
  };
}
