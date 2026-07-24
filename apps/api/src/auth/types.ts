import type { AuthenticatedUser } from "@reactify/shared";

export interface AuthUserContext {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  status: "active" | "disabled";
}

export interface AuthSessionContext {
  sessionId: string;
  expiresAt: Date;
}

export interface AuthenticatedRequestContext {
  user: AuthUserContext;
  session: AuthSessionContext;
}

export function toAuthenticatedUser(user: AuthUserContext): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthenticatedRequestContext;
  }
}
