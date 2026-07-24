import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validatePreviewScreenshot } from "./screenshotValidator.js";
import { testEnv } from "../../test/helpers.js";

async function createValidPreviewPngBase64(): Promise<string> {
  const buffer = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  return buffer.toString("base64");
}

describe("validatePreviewScreenshot", () => {
  it("accepts valid PNG base64", async () => {
    const result = validatePreviewScreenshot(await createValidPreviewPngBase64(), testEnv);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid base64 and wrong magic bytes", () => {
    expect(validatePreviewScreenshot("not-base64!!!", testEnv).ok).toBe(false);
    expect(validatePreviewScreenshot(Buffer.from("hello").toString("base64"), testEnv).ok).toBe(false);
  });

  it("rejects oversized encoded payload", () => {
    const result = validatePreviewScreenshot("a".repeat(testEnv.MAX_PREVIEW_SCREENSHOT_BYTES + 1), testEnv);
    expect(result.ok).toBe(false);
  });
});
