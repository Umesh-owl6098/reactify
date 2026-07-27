import { loadLocalEnv } from "./lib/load-local-env.js";
import { validateEnv } from "./env.js";
import { buildServer } from "./server.js";
import { connectDatabase, getPrismaClient, verifyDatabaseAvailability } from "./persistence/client.js";
import { verifySchemaReadiness } from "./persistence/schema-readiness.js";
import { logDatabaseIdentity } from "./lib/database-identity.js";
import { registerProcessLifecycle } from "./lib/process-lifecycle.js";
import { listenWithDevRetry } from "./lib/port-utils.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

registerProcessLifecycle({
  role: "api",
  onShutdown: async () => {
    if (app) {
      await app.close();
      app = null;
    }
  },
});

async function main() {
  loadLocalEnv();
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
    process.exit(1);
  }

  await logDatabaseIdentity(prisma, env.DATABASE_URL, "api");

  const built = await buildServer(env);
  app = built.app;

  try {
    await listenWithDevRetry(
      async () => {
        await app!.listen({ port: env.PORT, host: env.HOST });
      },
      { port: env.PORT, host: env.HOST },
    );
    console.info("Reactify API ready");
    console.info({
      event: "api_started",
      host: env.HOST,
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
