import type { Env } from "../env.js";
import type { GenerationStore } from "../pipeline/store.js";
import { connectDatabase, getPrismaClient, verifyDatabaseAvailability } from "./client.js";
import { PersistenceService } from "./PersistenceService.js";

export async function initializePersistence(
  env: Env,
  store: GenerationStore,
): Promise<PersistenceService> {
  const prisma = getPrismaClient(env);
  await connectDatabase(prisma);
  await verifyDatabaseAvailability(prisma);

  const persistence = new PersistenceService(prisma);

  store.setPersistHandler(async (record) => {
    const saved = await persistence.saveGeneration(record);
    record.stateVersion = saved.stateVersion;
  });

  store.hydrate(await persistence.loadActiveGenerations());
  await persistence.recoverAfterRestart();
  store.hydrate(await persistence.loadActiveGenerations());

  return persistence;
}
