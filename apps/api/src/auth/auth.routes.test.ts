import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ErrorCode } from "@reactify/shared";
import {
  createAuthenticatedTestImage,
  createTestServer,
  PNG_1X1,
  registerTestUser,
  withAuth,
} from "../test/helpers.js";

describe("auth routes", () => {
  let app: Awaited<ReturnType<typeof createTestServer>>["app"];

  beforeEach(async () => {
    process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
    app = (await createTestServer()).app;
  });

  afterEach(async () => {
    await app.close();
  });

  it("registers a user and returns safe fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin: "http://localhost:5174" },
      payload: {
        email: `register-${randomUUID()}@example.com`,
        password: "secure-password-123",
        displayName: "Register Test",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().user.displayName).toBe("Register Test");
    expect(JSON.stringify(response.json())).not.toMatch(/passwordHash|tokenHash|reactify_session/);
  });

  it("rejects duplicate registration", async () => {
    const email = `duplicate-${randomUUID()}@example.com`;
    const payload = {
      email,
      password: "secure-password-123",
      displayName: "Duplicate Test",
    };

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin: "http://localhost:5174" },
      payload,
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin: "http://localhost:5174" },
      payload,
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
  });

  it("returns the same invalid-credentials response for unknown email and wrong password", async () => {
    const auth = await registerTestUser(app, {
      email: `known-${randomUUID()}@example.com`,
      password: "secure-password-123",
      displayName: "Known User",
    });

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in",
      headers: { origin: "http://localhost:5174" },
      payload: { email: `known-${randomUUID()}@example.com`, password: "wrong-password-123" },
    });

    const unknownEmail = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in",
      headers: { origin: "http://localhost:5174" },
      payload: { email: `missing-${randomUUID()}@example.com`, password: "secure-password-123" },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(unknownEmail.json().error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(auth.cookie).toContain("reactify_session=");
  });

  it("returns current session and supports sign-out", async () => {
    const auth = await registerTestUser(app, {
      email: `session-${randomUUID()}@example.com`,
      password: "secure-password-123",
      displayName: "Session User",
    });

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: auth.cookie },
    });

    expect(session.json().authenticated).toBe(true);

    const signOut = await app.inject(
      withAuth(auth.cookie, {
        method: "POST",
        url: "/api/v1/auth/sign-out",
      }),
    );
    expect(signOut.statusCode).toBe(200);
  });

  it("rejects unauthenticated generation listing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/generations",
      headers: { origin: "http://localhost:5174" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("assigns ownerId on authenticated generation creation", async () => {
    const auth = await registerTestUser(app, {
      email: `owner-${randomUUID()}@example.com`,
      password: "secure-password-123",
      displayName: "Owner User",
    });
    const imageId = await createAuthenticatedTestImage(app, auth.cookie, PNG_1X1);

    const response = await app.inject(
      withAuth(auth.cookie, {
        method: "POST",
        url: "/api/v1/generations",
        payload: { imageId },
      }),
    );

    expect(response.statusCode).toBe(202);
    const generationId = response.json().generationId as string;
    const status = await app.inject(
      withAuth(auth.cookie, {
        method: "GET",
        url: `/api/v1/generations/${generationId}`,
      }),
    );
    expect(status.statusCode).toBe(200);
  });
});
