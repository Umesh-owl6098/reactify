import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { ErrorCode, type APIErrorBody } from "@reactify/shared";
import type { Env } from "../env.js";
import type { AuthService } from "./AuthService.js";
import type { SessionService } from "./SessionService.js";
import { getAuthAllowedOrigins } from "../env.js";
import { createDisabledAuthContext, isAuthDisabled } from "./auth-mode.js";

export interface AuthContext {
  authService: AuthService;
  sessionService: SessionService;
  env: Env;
}

export function sendAuthError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: APIErrorBody["error"]["code"],
  message: string,
): FastifyReply {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
      requestId: request.id || randomUUID(),
    },
  } satisfies APIErrorBody);
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function verifyMutationOrigin(request: FastifyRequest, env: Env): boolean {
  if (!MUTATING_METHODS.has(request.method)) {
    return true;
  }
  if (env.NODE_ENV === "test" && process.env.AUTH_SKIP_ORIGIN_CHECK === "true") {
    return true;
  }
  const origin = request.headers.origin;
  if (!origin) {
    return env.NODE_ENV !== "production";
  }
  return getAuthAllowedOrigins(env).includes(origin);
}

export function registerAuthHooks(app: import("fastify").FastifyInstance, context: AuthContext): void {
  app.addHook("onRequest", async (request, reply) => {
    if (
      request.url.startsWith("/api/v1/auth/") ||
      request.url === "/health" ||
      request.url === "/ready" ||
      request.url === "/api/v1/system/readiness"
    ) {
      return;
    }

    if (!verifyMutationOrigin(request, context.env)) {
      return sendAuthError(reply, request, 403, ErrorCode.FORBIDDEN, "Cross-origin request rejected.");
    }

    const token = request.cookies[context.env.SESSION_COOKIE_NAME];
    if (token) {
      const session = await context.sessionService.lookupSession(token);
      if (session) {
        request.auth = session;
      }
    }

    if (!request.auth && isAuthDisabled(context.env)) {
      request.auth = createDisabledAuthContext(context.env);
    }
  });
}

export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  env?: Env,
): request is FastifyRequest & { auth: NonNullable<FastifyRequest["auth"]> } {
  const resolvedEnv = env ?? request.server.reactifyEnv;
  if (resolvedEnv && isAuthDisabled(resolvedEnv)) {
    if (!request.auth) {
      request.auth = createDisabledAuthContext(resolvedEnv);
    }
    return true;
  }

  if (!request.auth) {
    sendAuthError(reply, request, 401, ErrorCode.AUTHENTICATION_REQUIRED, "Authentication required.");
    return false;
  }
  return true;
}
