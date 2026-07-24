import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { getUploadErrorMessage, UploadRequestError } from "./api";

describe("getUploadErrorMessage", () => {
  it("includes the backend message for corrupted signatures", () => {
    const message = getUploadErrorMessage(
      new UploadRequestError("The uploaded image appears to be corrupted or incomplete.", ErrorCode.CORRUPTED_IMAGE),
    );
    expect(message).toContain("signature did not match PNG, JPEG, or WebP");
  });

  it("includes authentication guidance", () => {
    const message = getUploadErrorMessage(
      new UploadRequestError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED),
    );
    expect(message).toContain("sign in is required");
  });

  it("includes safe backend database errors", () => {
    const message = getUploadErrorMessage(
      new UploadRequestError("Database query failed.", ErrorCode.DATABASE_QUERY_FAILED),
    );
    expect(message).toContain("Upload failed:");
    expect(message).toContain("database query failed");
  });
});
