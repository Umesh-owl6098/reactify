import type { PrismaClient } from "@prisma/client";

const REQUIRED_TABLES = [
  "User",
  "Session",
  "Generation",
  "UploadedImage",
  "ProjectVersion",
  "BackgroundJob",
  "JobAttempt",
  "UsageReservation",
  "AiUsageRecord",
  "RepairAttempt",
  "ProjectEdit",
  "VisualComparison",
  "ProjectExport",
] as const;

export interface SchemaReadinessResult {
  ready: boolean;
  databaseConnected: boolean;
  missingTables: string[];
  message: string | null;
}

export async function verifySchemaReadiness(client: PrismaClient): Promise<SchemaReadinessResult> {
  try {
    await client.$queryRaw`SELECT 1`;
  } catch {
    return {
      ready: false,
      databaseConnected: false,
      missingTables: [],
      message: "PostgreSQL connection failed. Confirm DATABASE_URL and that PostgreSQL is running.",
    };
  }

  const missingTables: string[] = [];

  for (const table of REQUIRED_TABLES) {
    try {
      await client.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
    } catch {
      missingTables.push(table);
    }
  }

  if (missingTables.length > 0) {
    return {
      ready: false,
      databaseConnected: true,
      missingTables,
      message: "Database migrations are incomplete. Run pnpm db:migrate or pnpm db:deploy.",
    };
  }

  return {
    ready: true,
    databaseConnected: true,
    missingTables: [],
    message: null,
  };
}
