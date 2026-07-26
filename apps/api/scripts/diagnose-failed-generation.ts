/**
 * Read-only replay of the failed enqueue for generation 76825ff8-...
 * Does NOT create a new generation.
 */
import { PrismaClient } from "@prisma/client";

const GENERATION_ID = "76825ff8-3eef-4202-9370-e8fd3b290742";

function parseDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, ""),
      schema: parsed.searchParams.get("schema") ?? "public",
    };
  } catch {
    return { host: "unknown", port: "unknown", database: "unknown", schema: "public" };
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "postgresql://reactify:reactify_dev@localhost:5434/reactify";
  const identity = parseDatabaseUrl(databaseUrl);

  console.log("=== DATABASE CONNECTIVITY ===");
  console.log("DATABASE_URL host:", identity.host);
  console.log("DATABASE_URL port:", identity.port);
  console.log("database name:", identity.database);
  console.log("schema:", identity.schema);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    console.log("Prisma connect: OK");
  } catch (error) {
    console.log("Prisma connect: FAILED");
    console.error(error);
    process.exit(1);
  }

  const tables = ["Generation", "BackgroundJob", "JobAttempt", "PipelineStageRecord", "UsageReservation"] as const;
  console.log("\n=== REQUIRED TABLES ===");
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      table === "PipelineStage" ? "PipelineStageRecord" : table,
    );
    console.log(`${table}:`, rows[0]?.exists ? "exists" : "MISSING");
  }

  const generation = await prisma.generation.findUnique({ where: { id: GENERATION_ID } });
  console.log("\n=== FAILED GENERATION ===");
  console.log(JSON.stringify(generation, null, 2));

  const jobs = await prisma.backgroundJob.findMany({ where: { generationId: GENERATION_ID } });
  console.log("\nBackgroundJob rows:", jobs.length);

  console.log("\n=== REPLAY ORIGINAL FAILURE (enqueue before generation row existed) ===");
  const ghostId = crypto.randomUUID();
  try {
    await prisma.backgroundJob.create({
      data: {
        generationId: ghostId,
        ownerId: generation!.ownerId,
        jobType: "design_analysis",
        status: "queued",
        payload: { generationId: ghostId, imageId: generation!.sourceImageId },
        idempotencyKey: `replay-${ghostId}`,
      },
    });
  } catch (error) {
    console.log("\n--- ORIGINAL PRISMA EXCEPTION (unwrapped) ---");
    console.log("name:", error instanceof Error ? error.name : typeof error);
    console.log("message:", error instanceof Error ? error.message : String(error));
    if (typeof error === "object" && error !== null) {
      const e = error as Record<string, unknown>;
      if ("code" in e) console.log("code:", e.code);
      if ("meta" in e) console.log("meta:", JSON.stringify(e.meta, null, 2));
      if ("clientVersion" in e) console.log("clientVersion:", e.clientVersion);
    }
    console.log("\n--- FULL STACK ---");
    console.log(error instanceof Error ? error.stack : "no stack");
  }

  console.log("\n=== WHY DATABASE_UNAVAILABLE APPEARS IN UI ===");
  console.log(
    "POST /generations catch (generations.ts) sets failureCode = JOB_ENQUEUE_FAILED for non-usage errors.",
  );
  console.log(
    "This generation's stored failureCode is DATABASE_UNAVAILABLE — likely from an older recovery path",
  );
  console.log(
    "that copied error.code from a wrapped PersistenceError, OR the running server predated JOB_ENQUEUE_FAILED.",
  );
  console.log(
    "The underlying enqueue exception is NOT a connection failure; it is a foreign-key violation (P2003).",
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
