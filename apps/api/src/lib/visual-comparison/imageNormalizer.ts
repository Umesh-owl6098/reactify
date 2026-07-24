import sharp from "sharp";

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
    background: "white";
  };
}

/**
 * Normalize an image to a deterministic canvas size while preserving aspect ratio.
 * Images are flattened onto a white background, resized to fit within the target box,
 * then centered on a fixed canvas of targetWidth x targetHeight.
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

  const scale = Math.min(targetWidth / originalWidth, targetHeight / originalHeight, 1);
  const normalizedWidth = Math.max(1, Math.round(originalWidth * scale));
  const normalizedHeight = Math.max(1, Math.round(originalHeight * scale));

  const resized = await source
    .resize(normalizedWidth, normalizedHeight, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();

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
      padded: normalizedWidth !== targetWidth || normalizedHeight !== targetHeight,
      background: "white",
    },
  };
}

export async function createThumbnail(input: Buffer, maxSize = 320): Promise<Buffer> {
  return sharp(input).resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
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
