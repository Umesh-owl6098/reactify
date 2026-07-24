import type { InjectOptions } from "fastify";
import type { FastifyInstance } from "fastify";

export const TEST_AUTH_ORIGIN = "http://localhost:5174";

export function testAuthHeaders(cookie?: string): Record<string, string> {
  return {
    origin: TEST_AUTH_ORIGIN,
    ...(cookie ? { cookie } : {}),
  };
}

export function extractSessionCookie(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
  const sessionCookie = cookies.find((entry) => entry.startsWith("reactify_session="));
  if (!sessionCookie) {
    throw new Error("Expected reactify_session cookie in response.");
  }
  return sessionCookie.split(";")[0] ?? "";
}

export async function registerTestUser(
  app: FastifyInstance,
  input: { email: string; password: string; displayName: string },
): Promise<{ cookie: string; userId: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: testAuthHeaders(),
    payload: input,
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to register test user: ${response.body}`);
  }

  return {
    cookie: extractSessionCookie(response),
    userId: response.json().user.id as string,
  };
}

export async function signInTestUser(
  app: FastifyInstance,
  input: { email: string; password: string },
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/sign-in",
    headers: testAuthHeaders(),
    payload: input,
  });

  if (response.statusCode !== 200) {
    throw new Error(`Failed to sign in test user: ${response.body}`);
  }

  return extractSessionCookie(response);
}

export function withAuth(cookie: string, options: InjectOptions = {}): InjectOptions {
  return {
    ...options,
    headers: {
      ...testAuthHeaders(cookie),
      ...(options.headers ?? {}),
    },
  };
}

export async function createAuthenticatedTestImage(
  app: FastifyInstance,
  cookie: string,
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
    withAuth(cookie, {
      method: "POST",
      url: "/api/v1/images",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    }),
  );

  if (response.statusCode !== 201) {
    throw new Error(`Failed to upload test image: ${response.body}`);
  }

  return response.json().imageId as string;
}
