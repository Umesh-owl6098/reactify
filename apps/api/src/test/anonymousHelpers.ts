import type { FastifyInstance, InjectOptions } from "fastify";
import { testAuthHeaders } from "./authHelpers.js";

export function withOrigin(options: InjectOptions = {}): InjectOptions {
  return {
    ...options,
    headers: {
      ...testAuthHeaders(),
      ...(options.headers ?? {}),
    },
  };
}

export async function createAnonymousTestImage(
  app: FastifyInstance,
  buffer: Buffer,
  filename = "test.png",
): Promise<string> {
  const boundary = "----reactify-test-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await app.inject(
    withOrigin({
      method: "POST",
      url: "/api/v1/images",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    }),
  );

  if (response.statusCode !== 201) {
    throw new Error(`Failed to upload anonymous test image: ${response.body}`);
  }

  return response.json().imageId as string;
}
