import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { AuthRateLimiter } from "./AuthRateLimiter.js";
import { AuthRepository } from "./AuthRepository.js";
import { AuthService } from "./AuthService.js";
import { AuthorizationService } from "./AuthorizationService.js";
import { PasswordService } from "./PasswordService.js";
import { SessionService } from "./SessionService.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { ImageStorage } from "../lib/imageStorage.js";

export function createAuthServices(env: Env, prisma: PrismaClient, store: GenerationStore, imageStorage?: ImageStorage) {
  const repository = new AuthRepository(prisma);
  const passwordService = new PasswordService(env);
  const sessionService = new SessionService(prisma, env);
  const rateLimiter = new AuthRateLimiter(env);
  const authService = new AuthService(env, repository, passwordService, sessionService, rateLimiter);
  const authorizationService = new AuthorizationService(store, repository, imageStorage);

  return {
    repository,
    passwordService,
    sessionService,
    authService,
    authorizationService,
    rateLimiter,
  };
}

export type AuthServices = ReturnType<typeof createAuthServices>;
