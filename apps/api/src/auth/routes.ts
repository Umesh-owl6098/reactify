import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ActiveSessionListResponseSchema,
  AuthenticatedUserSchema,
  SessionResponseSchema,
  SignInRequestSchema,
  UpdateProfileRequestSchema,
} from "@reactify/shared";
import { ErrorCode } from "@reactify/shared";
import type { AuthContext } from "./middleware.js";
import { requireAuth } from "./middleware.js";
import { disabledSessionResponse, isAuthDisabled } from "./auth-mode.js";
import type { AuthRepository } from "./AuthRepository.js";

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
) {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
      requestId: request.id || randomUUID(),
      fieldErrors,
    },
  });
}

export async function registerAuthRoutes(app: FastifyInstance, context: AuthContext, repository: AuthRepository): Promise<void> {
  app.post("/api/v1/auth/register", async (request, reply) => {
    if (isAuthDisabled(context.env)) {
      return sendError(reply, request, 403, ErrorCode.FORBIDDEN, "Authentication is disabled.");
    }
    const result = await context.authService.register({
      body: request.body,
      reply,
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.code, result.message, result.fieldErrors);
    }
    return reply.status(201).send({
      user: AuthenticatedUserSchema.parse(result.user),
      sessionExpiresAt: result.sessionExpiresAt,
    });
  });

  app.post("/api/v1/auth/sign-in", async (request, reply) => {
    if (isAuthDisabled(context.env)) {
      return sendError(reply, request, 403, ErrorCode.FORBIDDEN, "Authentication is disabled.");
    }
    const parsed = SignInRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 401, ErrorCode.INVALID_CREDENTIALS, "Invalid email or password.");
    }
    const result = await context.authService.signIn({
      body: request.body,
      reply,
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.code, result.message);
    }
    return reply.send({
      user: AuthenticatedUserSchema.parse(result.user),
      sessionExpiresAt: result.sessionExpiresAt,
    });
  });

  app.post("/api/v1/auth/sign-out", async (request, reply) => {
    await context.authService.signOut({
      sessionId: request.auth?.session.sessionId,
      reply,
    });
    return reply.send({ ok: true });
  });

  app.get("/api/v1/auth/session", async (request, reply) => {
    if (isAuthDisabled(context.env)) {
      return reply.send(SessionResponseSchema.parse(disabledSessionResponse(context.env)));
    }
    const token = request.cookies[context.env.SESSION_COOKIE_NAME];
    const session = await context.authService.getSession(token);
    return reply.send(SessionResponseSchema.parse(session));
  });

  app.patch("/api/v1/account/profile", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }
    const parsed = UpdateProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 422, ErrorCode.INVALID_REGISTRATION, "Profile update is invalid.");
    }
    const result = await context.authService.updateProfile(request.auth.user.id, request.body);
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.code, result.message);
    }
    return reply.send({ user: AuthenticatedUserSchema.parse(result.user) });
  });

  app.post("/api/v1/account/change-password", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }
    const result = await context.authService.changePassword({
      userId: request.auth.user.id,
      sessionId: request.auth.session.sessionId,
      body: request.body,
      reply,
      ip: request.ip,
    });
    if (!result.ok) {
      return sendError(reply, request, result.statusCode, result.code, result.message);
    }
    return reply.send({ ok: true });
  });

  app.get("/api/v1/account/sessions", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }
    const sessions = await repository.listActiveSessions(request.auth.user.id);
    const response = ActiveSessionListResponseSchema.parse({
      sessions: sessions.map((session) => ({
        sessionId: session.id,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
        expiresAt: session.expiresAt.toISOString(),
        currentSession: session.id === request.auth.session.sessionId,
        deviceLabel: session.id === request.auth.session.sessionId ? "Current browser" : "Other active session",
      })),
    });
    return reply.send(response);
  });

  app.delete("/api/v1/account/sessions/:sessionId", async (request, reply) => {
    if (!requireAuth(request, reply)) {
      return;
    }
    const { sessionId } = request.params as { sessionId: string };
    const session = await repository.findSessionForUser(request.auth.user.id, sessionId);
    if (!session) {
      return sendError(reply, request, 404, ErrorCode.INTERNAL_ERROR, "Session not found.");
    }
    await context.sessionService.revokeSession(sessionId);
    if (sessionId === request.auth.session.sessionId) {
      context.sessionService.clearSessionCookie(reply);
    }
    return reply.send({ ok: true });
  });
}
