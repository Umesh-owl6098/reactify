import { ErrorCode } from "@reactify/shared";
import type { Env } from "../../env.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PreviewScreenshotValidationSuccess {
  ok: true;
  buffer: Buffer;
  width: number;
  height: number;
}

export interface PreviewScreenshotValidationFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.SCREENSHOT_CAPTURE_FAILED
    | typeof ErrorCode.IMAGE_DIMENSIONS_INVALID
    | typeof ErrorCode.FILE_TOO_LARGE;
  message: string;
}

export type PreviewScreenshotValidationResult =
  | PreviewScreenshotValidationSuccess
  | PreviewScreenshotValidationFailure;

function decodeBase64Payload(input: string): Buffer | null {
  const trimmed = input.trim();
  const payload = trimmed.includes(",") ? trimmed.split(",").pop() ?? "" : trimmed;
  if (!payload || payload.length % 4 !== 0) {
    return null;
  }

  try {
    return Buffer.from(payload, "base64");
  } catch {
    return null;
  }
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function hasAnimatedPngChunks(buffer: Buffer): boolean {
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "acTL" || type === "fcTL" || type === "fdAT") {
      return true;
    }
    offset += 12 + length;
  }
  return false;
}

export function validatePreviewScreenshot(
  screenshotBase64: string,
  env: Pick<
    Env,
    "MAX_PREVIEW_SCREENSHOT_BYTES" | "MAX_PREVIEW_SCREENSHOT_DIMENSION" | "MIN_PREVIEW_SCREENSHOT_DIMENSION"
  >,
): PreviewScreenshotValidationResult {
  const encodedBytes = Buffer.byteLength(screenshotBase64, "utf8");
  if (encodedBytes > env.MAX_PREVIEW_SCREENSHOT_BYTES) {
    return {
      ok: false,
      errorCode: ErrorCode.FILE_TOO_LARGE,
      message: "Screenshot payload exceeds the maximum allowed encoded size.",
    };
  }

  const buffer = decodeBase64Payload(screenshotBase64);
  if (!buffer || buffer.length === 0) {
    return {
      ok: false,
      errorCode: ErrorCode.SCREENSHOT_CAPTURE_FAILED,
      message: "Screenshot payload is not valid base64.",
    };
  }

  if (buffer.length > env.MAX_PREVIEW_SCREENSHOT_BYTES) {
    return {
      ok: false,
      errorCode: ErrorCode.FILE_TOO_LARGE,
      message: "Screenshot exceeds the maximum allowed decoded size.",
    };
  }

  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return {
      ok: false,
      errorCode: ErrorCode.SCREENSHOT_CAPTURE_FAILED,
      message: "Screenshot must be a PNG image.",
    };
  }

  if (hasAnimatedPngChunks(buffer)) {
    return {
      ok: false,
      errorCode: ErrorCode.SCREENSHOT_CAPTURE_FAILED,
      message: "Animated PNG screenshots are not supported.",
    };
  }

  const dimensions = readPngDimensions(buffer);
  if (!dimensions) {
    return {
      ok: false,
      errorCode: ErrorCode.SCREENSHOT_CAPTURE_FAILED,
      message: "Screenshot PNG structure is invalid.",
    };
  }

  const { width, height } = dimensions;
  if (
    width < env.MIN_PREVIEW_SCREENSHOT_DIMENSION ||
    height < env.MIN_PREVIEW_SCREENSHOT_DIMENSION ||
    width > env.MAX_PREVIEW_SCREENSHOT_DIMENSION ||
    height > env.MAX_PREVIEW_SCREENSHOT_DIMENSION
  ) {
    return {
      ok: false,
      errorCode: ErrorCode.IMAGE_DIMENSIONS_INVALID,
      message: "Screenshot dimensions are outside the allowed range.",
    };
  }

  return { ok: true, buffer, width, height };
}
