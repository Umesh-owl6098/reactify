import sharp from "sharp";

/** Aspect ratios within this relative tolerance are treated as matching. */
const ASPECT_RATIO_TOLERANCE = 0.005;

export type ImageResizeMode = "fill" | "contain";

export interface NormalizedImage {
  width: number;
  height: number;
  raw: Buffer;
  png: Buffer;
  metadata: {
    originalWidth: number;
    originalHeight: number;
    normalizedWidth: number;
    normalizedHeight: number;
    padded: boolean;
    resizeMode: ImageResizeMode;
    background: "white";
  };
}

function aspectsMatch(originalWidth: number, originalHeight: number, targetWidth: number, targetHeight: number): boolean {
  const sourceAspect = originalWidth / originalHeight;
  const targetAspect = targetWidth / targetHeight;
  const relativeDelta = Math.abs(sourceAspect - targetAspect) / targetAspect;
  return relativeDelta <= ASPECT_RATIO_TOLERANCE;
}

/**
 * Normalize an image to a deterministic viewport size for visual comparison.
 *
 * - Matching aspect ratio: resize uniformly to exactly fill the target viewport (no padding).
 * - Differing aspect ratio: contain within the viewport on a neutral white background (centered).
 */
export async function normalizeImage(
  input: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<NormalizedImage> {
  const source = sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
  const metadata = await source.metadata();
  const originalWidth = metadata.width ?? targetWidth;
  const originalHeight = metadata.height ?? targetHeight;

  if (aspectsMatch(originalWidth, originalHeight, targetWidth, targetHeight)) {
    const png = await source.resize(targetWidth, targetHeight, { fit: "fill" }).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    return {
      width: info.width,
      height: info.height,
      raw: data,
      png,
      metadata: {
        originalWidth,
        originalHeight,
        normalizedWidth: targetWidth,
        normalizedHeight: targetHeight,
        padded: false,
        resizeMode: "fill",
        background: "white",
      },
    };
  }

  const scale = Math.min(targetWidth / originalWidth, targetHeight / originalHeight);
  const normalizedWidth = Math.max(1, Math.round(originalWidth * scale));
  const normalizedHeight = Math.max(1, Math.round(originalHeight * scale));

  const resized = await source.resize(normalizedWidth, normalizedHeight, { fit: "inside" }).png().toBuffer();

  const left = Math.floor((targetWidth - normalizedWidth) / 2);
  const top = Math.floor((targetHeight - normalizedHeight) / 2);

  const canvas = sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png();

  const png = await canvas.toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    raw: data,
    png,
    metadata: {
      originalWidth,
      originalHeight,
      normalizedWidth,
      normalizedHeight,
      padded: true,
      resizeMode: "contain",
      background: "white",
    },
  };
}

export async function createOverlayImage(
  previewPng: Buffer,
  diffRaw: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const overlay = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const diffOffset = index * 4;
    const alpha = diffRaw[diffOffset + 3] ?? 0;
    if (alpha === 0) {
      continue;
    }
    const overlayOffset = index * 4;
    overlay[overlayOffset] = 255;
    overlay[overlayOffset + 1] = 64;
    overlay[overlayOffset + 2] = 64;
    overlay[overlayOffset + 3] = Math.min(180, alpha + 64);
  }

  return sharp(previewPng)
    .composite([{ input: overlay, raw: { width, height, channels: 4 }, blend: "over" }])
    .png()
    .toBuffer();
}

export async function createRegionsImage(
  previewPng: Buffer,
  regions: Array<{ bounds: { x: number; y: number; width: number; height: number } }>,
  width: number,
  height: number,
): Promise<Buffer> {
  const overlay = Buffer.alloc(width * height * 4);
  for (const region of regions) {
    const { x, y, width: regionWidth, height: regionHeight } = region.bounds;
    for (let row = y; row < y + regionHeight; row += 1) {
      for (let col = x; col < x + regionWidth; col += 1) {
        if (row < 0 || col < 0 || row >= height || col >= width) {
          continue;
        }
        const offset = (row * width + col) * 4;
        overlay[offset] = 250;
        overlay[offset + 1] = 204;
        overlay[offset + 2] = 21;
        overlay[offset + 3] = 96;
      }
    }
  }

  return sharp(previewPng)
    .composite([{ input: overlay, raw: { width, height, channels: 4 }, blend: "over" }])
    .png()
    .toBuffer();
}
