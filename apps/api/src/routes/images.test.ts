import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import {
  createTestServer,
  registerTestUser,
  withAuth,
  testEnv as baseTestEnv,
} from "../test/helpers.js";

export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=",
  "base64",
);

export function createMultipartPayload(
  boundary: string,
  fieldName: string,
  filename: string,
  contentType: string,
  data: Buffer,
): Buffer {
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return Buffer.concat([prefix, data, suffix]);
}

describe("image routes", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];
  let authCookie = "";

  beforeEach(async () => {
    process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
    const setup = await createTestServer();
    app = setup.app;
    authCookie = setup.authCookie;
  });

  afterEach(async () => {
    await app.close();
  });

  it("uploads a valid png", async () => {
    const boundary = "test-boundary-png";
    const payload = createMultipartPayload(boundary, "image", "pixel.png", "image/png", PNG_1X1);

    const response = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/images",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      }),
    );

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.mimeType).toBe("image/png");
    expect(body.sizeBytes).toBe(PNG_1X1.length);
    expect(body.previewUrl).toBe(`/api/v1/images/${body.imageId}`);
  });

  it("rejects unauthenticated uploads", async () => {
    const boundary = "test-boundary-unauth";
    const payload = createMultipartPayload(boundary, "image", "pixel.png", "image/png", PNG_1X1);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/images",
      headers: {
        origin: "http://localhost:5174",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects uploads from a disallowed origin", async () => {
    const boundary = "test-boundary-origin";
    const payload = createMultipartPayload(boundary, "image", "pixel.png", "image/png", PNG_1X1);
    delete process.env.AUTH_SKIP_ORIGIN_CHECK;

    const response = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/images",
        headers: {
          origin: "http://evil.example",
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      }),
    );

    process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("uploads a valid jpeg", async () => {
    const boundary = "test-boundary-jpeg";
    const payload = createMultipartPayload(boundary, "image", "pixel.jpg", "image/jpeg", JPEG_1X1);

    const response = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/images",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().mimeType).toBe("image/jpeg");
  });

  it("rejects an unsupported file", async () => {
    const boundary = "test-boundary-unsupported";
    const payload = createMultipartPayload(
      boundary,
      "image",
      "notes.txt",
      "text/plain",
      Buffer.from("hello world", "utf8"),
    );

    const response = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/images",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      }),
    );

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("INVALID_MIME_TYPE");
  });

  it("rejects an oversized file", async () => {
    await app.close();
    const storageDir = await mkdtemp(join(tmpdir(), "reactify-images-"));
    app = (await buildServer({ ...baseTestEnv, IMAGE_MAX_BYTES: 32 }, { storageDir })).app;
    const auth = await registerTestUser(app, {
      email: `oversized-${randomUUID()}@example.com`,
      password: "secure-password-123",
      displayName: "Oversized Test",
    });
    authCookie = auth.cookie;

    const boundary = "test-boundary-oversized";
    const payload = createMultipartPayload(boundary, "image", "pixel.png", "image/png", PNG_1X1);

    const response = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/images",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      }),
    );

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects a missing image field", async () => {
    const boundary = "test-boundary-missing";
    const payload = Buffer.from(`--${boundary}--\r\n`, "utf8");

    const response = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/images",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      }),
    );

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("UNSUPPORTED_IMAGE");
  });

  it("returns uploaded image bytes on GET", async () => {
    const boundary = "test-boundary-get";
    const payload = createMultipartPayload(boundary, "image", "pixel.png", "image/png", PNG_1X1);

    const uploadResponse = await app.inject(
      withAuth(authCookie, {
        method: "POST",
        url: "/api/v1/images",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      }),
    );

    const uploaded = uploadResponse.json();
    const getResponse = await app.inject(
      withAuth(authCookie, {
        method: "GET",
        url: uploaded.previewUrl,
      }),
    );

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(getResponse.rawPayload)).toEqual(PNG_1X1);
  });

  it("returns 404 for a missing image", async () => {
    const response = await app.inject(
      withAuth(authCookie, {
        method: "GET",
        url: "/api/v1/images/550e8400-e29b-41d4-a716-446655440000",
      }),
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("IMAGE_NOT_FOUND");
  });
});
