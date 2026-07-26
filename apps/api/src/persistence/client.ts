import { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";

declare global {
  var __reactifyPrisma: PrismaClient | undefined;
}

export function createPrismaClient(env: Env): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getPrismaClient(env: Env): PrismaClient {
  if (env.NODE_ENV !== "production") {
    if (!globalThis.__reactifyPrisma) {
      globalThis.__reactifyPrisma = createPrismaClient(env);
    }
    return globalThis.__reactifyPrisma;
  }

  return createPrismaClient(env);
}

export async function connectDatabase(client: PrismaClient): Promise<void> {
  await client.$connect();
}

export async function disconnectDatabase(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}

export async function verifyDatabaseAvailability(client: PrismaClient): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}
