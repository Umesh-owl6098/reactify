import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionService } from "./SessionService.js";
import { testEnv } from "../test/helpers.js";
import { getPrismaClient } from "../persistence/client.js";
import { hashSessionToken } from "./crypto.js";

describe("SessionService", () => {
  const prisma = getPrismaClient(testEnv);
  const service = new SessionService(prisma, testEnv);
  let userId = "";

  beforeEach(async () => {
    const email = `session-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        normalizedEmail: email.toLowerCase(),
        passwordHash: "hash",
        displayName: "Session Test",
        status: "active",
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("generates secure tokens", () => {
    const token = service.createToken();
    expect(token.length).toBeGreaterThan(20);
  });

  it("stores only token hashes", async () => {
    const token = service.createToken();
    const created = await service.createSession({ userId, token });
    const row = await prisma.session.findUniqueOrThrow({ where: { id: created.sessionId } });
    expect(row.tokenHash).toBe(hashSessionToken(token));
    expect(row.tokenHash).not.toBe(token);
  });

  it("looks up valid sessions", async () => {
    const token = service.createToken();
    await service.createSession({ userId, token });
    const context = await service.lookupSession(token);
    expect(context?.user.id).toBe(userId);
  });

  it("rejects expired sessions", async () => {
    const token = service.createToken();
    const created = await service.createSession({ userId, token });
    await prisma.session.update({
      where: { id: created.sessionId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await service.lookupSession(token)).toBeNull();
  });

  it("rejects revoked sessions", async () => {
    const token = service.createToken();
    const created = await service.createSession({ userId, token });
    await service.revokeSession(created.sessionId);
    expect(await service.lookupSession(token)).toBeNull();
  });

  it("rejects disabled-user sessions", async () => {
    const token = service.createToken();
    await service.createSession({ userId, token });
    await prisma.user.update({ where: { id: userId }, data: { status: "disabled" } });
    expect(await service.lookupSession(token)).toBeNull();
  });

  it("uses HttpOnly cookies in development", () => {
    const reply = {
      setCookie: (_name: string, _value: string, options: Record<string, unknown>) => options,
    };
    const options = reply.setCookie("reactify_session", "token", service.getCookieOptions());
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(false);
  });

  it("uses Secure cookies in production", () => {
    const productionService = new SessionService(prisma, { ...testEnv, NODE_ENV: "production" });
    expect(productionService.getCookieOptions().secure).toBe(true);
  });
});
