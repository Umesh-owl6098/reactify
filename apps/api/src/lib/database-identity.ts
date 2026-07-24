import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export interface DatabaseIdentity {
  databaseHostHash: string;
  databaseName: string;
  migrationCount: number;
  latestMigration: string | null;
}

export function parseDatabaseIdentity(databaseUrl: string): Pick<DatabaseIdentity, "databaseHostHash" | "databaseName"> {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname || "unknown-host";
    const port = parsed.port ? `:${parsed.port}` : "";
    const databaseName = parsed.pathname.replace(/^\//, "") || "unknown-database";
    const hostFingerprint = createHash("sha256").update(`${host}${port}`).digest("hex").slice(0, 12);

    return {
      databaseHostHash: hostFingerprint,
      databaseName,
    };
  } catch {
    return {
      databaseHostHash: createHash("sha256").update("invalid-database-url").digest("hex").slice(0, 12),
      databaseName: "unknown-database",
    };
  }
}

export async function resolveDatabaseIdentity(
  prisma: PrismaClient,
  databaseUrl: string,
): Promise<DatabaseIdentity> {
  const parsed = parseDatabaseIdentity(databaseUrl);

  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      ORDER BY finished_at DESC NULLS LAST, started_at DESC
      LIMIT 1
    `;

    const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"
    `;

    return {
      ...parsed,
      migrationCount: Number(countRows[0]?.count ?? 0),
      latestMigration: rows[0]?.migration_name ?? null,
    };
  } catch {
    return {
      ...parsed,
      migrationCount: 0,
      latestMigration: null,
    };
  }
}

export async function logDatabaseIdentity(
  prisma: PrismaClient,
  databaseUrl: string,
  processRole: "api" | "worker",
): Promise<DatabaseIdentity> {
  const identity = await resolveDatabaseIdentity(prisma, databaseUrl);
  console.info({
    event: "database_identity",
    processRole,
    databaseHostHash: identity.databaseHostHash,
    databaseName: identity.databaseName,
    migrationCount: identity.migrationCount,
    latestMigration: identity.latestMigration,
  });
  return identity;
}
