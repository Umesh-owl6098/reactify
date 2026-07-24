import { describe, expect, it } from "vitest";
import { ImageUploadResponseSchema } from "./upload.js";

describe("ImageUploadResponseSchema", () => {
  it("accepts a valid upload response", () => {
    const result = ImageUploadResponseSchema.safeParse({
      imageId: "550e8400-e29b-41d4-a716-446655440000",
      mimeType: "image/png",
      sizeBytes: 2048,
      previewUrl: "/api/v1/images/550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid preview URLs", () => {
    const result = ImageUploadResponseSchema.safeParse({
      imageId: "550e8400-e29b-41d4-a716-446655440000",
      mimeType: "image/png",
      sizeBytes: 2048,
      previewUrl: "/images/550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
  });
});
