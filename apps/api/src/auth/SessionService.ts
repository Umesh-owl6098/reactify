import { randomBytes } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { hashIp, hashSessionToken, hashUserAgent, safeEqual } from "./crypto.js";
import type { AuthenticatedRequestContext, AuthUserContext } from "./types.js";

export class SessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  createToken(): string {
    return randomBytes(this.env.SESSION_TOKEN_BYTES).toString("base64url");
  }

  getCookieOptions() {
    const maxAgeSeconds = this.env.SESSION_TTL_HOURS * 60 * 60;
    return {
      path: "/",
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.env.NODE_ENV === "production",
      maxAge: maxAgeSeconds,
    };
  }

  setSessionCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(this.env.SESSION_COOKIE_NAME, token, this.getCookieOptions());
  }

  clearSessionCookie(reply: FastifyReply): void {
    reply.clearCookie(this.env.SESSION_COOKIE_NAME, { path: "/" });
  }

  async createSession(input: {
    userId: string;
    token: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ sessionId: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash: hashSessionToken(input.token),
        expiresAt,
        userAgentHash: hashUserAgent(input.userAgent),
        ipHash: hashIp(input.ip),
      },
    });
    return { sessionId: session.id, expiresAt };
  }

  async lookupSession(token: string): Promise<AuthenticatedRequestContext | null> {
    const tokenHash = hashSessionToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return null;
    }
    if (session.user.status !== "active" || session.user.deletedAt) {
      return null;
    }

    const shouldUpdateLastUsed =
      !session.lastUsedAt || Date.now() - session.lastUsedAt.getTime() > 60_000;
    if (shouldUpdateLastUsed) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }

    const user: AuthUserContext = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      createdAt: session.user.createdAt.toISOString(),
      status: session.user.status as AuthUserContext["status"],
    };

    return {
      user,
      session: {
        sessionId: session.id,
        expiresAt: session.expiresAt,
      },
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  matchesToken(token: string, tokenHash: string): boolean {
    return safeEqual(hashSessionToken(token), tokenHash);
  }
}
