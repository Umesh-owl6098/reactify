import type { GenerationStore } from "../pipeline/store.js";
import type { GenerationRecord } from "../pipeline/types.js";
import type { PersistenceService } from "../persistence/PersistenceService.js";
import type { AuthorizationService } from "../auth/AuthorizationService.js";
import { isAuthDisabled } from "../auth/auth-mode.js";
import { recoverMissingInitialVersion } from "./generatedProjectVersionRecovery.js";
import { recoverStaleRepairVersionIntegrity } from "./repair/repairVersionFinalization.js";

export async function hydrateOwnedGenerationRecord(input: {
  store: GenerationStore;
  persistence: PersistenceService;
  generationId: string;
  ownerId: string;
  authorization?: AuthorizationService;
  relaxedOwnership?: boolean;
}): Promise<GenerationRecord | null> {
  const relaxedOwnership =
    input.relaxedOwnership ??
    (input.authorization ? isAuthDisabled(input.authorization.getEnv()) : false);
  const fresh = await input.persistence.generations.findById(
    input.generationId,
    relaxedOwnership ? undefined : input.ownerId,
  );
  if (!fresh) {
    return null;
  }

  input.store.hydrate([fresh]);

  const record = input.store.get(input.generationId);
  if (!record) {
    return null;
  }

  if (recoverMissingInitialVersion(record)) {
    await input.store.persist(record);
  }

  const refreshed = input.store.get(input.generationId);
  if (refreshed && recoverStaleRepairVersionIntegrity(refreshed)) {
    await input.store.persist(refreshed);
  }

  return input.store.get(input.generationId) ?? record;
}
