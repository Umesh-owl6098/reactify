import type { PrismaClient } from "@prisma/client";
import { DEFAULT_DEMO_USER } from "@reactify/shared";
import type { Env } from "../env.js";
import { getDefaultDemoUserId, isAuthDisabled } from "./auth-mode.js";

export async function ensureDemoUser(prisma: PrismaClient, env: Env): Promise<void> {
  if (!isAuthDisabled(env)) {
    return;
  }

  const userId = getDefaultDemoUserId(env);
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: DEFAULT_DEMO_USER.email,
      normalizedEmail: DEFAULT_DEMO_USER.email,
      passwordHash: "auth-disabled",
      displayName: DEFAULT_DEMO_USER.displayName,
      status: "active",
    },
    update: {
      displayName: DEFAULT_DEMO_USER.displayName,
      status: "active",
      deletedAt: null,
    },
  });
}
