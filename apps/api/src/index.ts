import { validateEnv } from "./env.js";
import { buildServer } from "./server.js";
import { connectDatabase, getPrismaClient, verifyDatabaseAvailability } from "./persistence/client.js";
import { verifySchemaReadiness } from "./persistence/schema-readiness.js";
import { logDatabaseIdentity } from "./lib/database-identity.js";

async function main() {
  const env = validateEnv();
  const prisma = getPrismaClient(env);

  try {
    await connectDatabase(prisma);
    await verifyDatabaseAvailability(prisma);
    console.info({ event: "postgresql_connection_confirmed" });
  } catch (error) {
    console.error({
      event: "postgresql_connection_failed",
      message: error instanceof Error ? error.message : "Unknown database connection error",
    });
    process.exit(1);
  }

  const schema = await verifySchemaReadiness(prisma);
  if (!schema.ready) {
    console.error({
      event: "database_schema_not_ready",
      message: schema.message,
      missingTables: schema.missingTables,
    });
    if (env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  await logDatabaseIdentity(prisma, env.DATABASE_URL, "api");

  const { app } = await buildServer(env);

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.info("Reactify API ready");
    console.info({
      event: "api_started",
      port: env.PORT,
      aiProvider: env.AI_PROVIDER,
      jobInlineExecution: env.JOB_INLINE_EXECUTION,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
