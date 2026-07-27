import type { Env } from "../../src/env.js";
import {
  createAppStorage,
  createComparisonArtifactStore,
  createExportArtifactStore,
  createImageStorage,
} from "../../src/lib/storage/createStorageProvider.js";

export function createScriptStores(env: Env) {
  const appStorage = createAppStorage(env);
  return {
    appStorage,
    imageStorage: createImageStorage(env),
    exportArtifactStore: createExportArtifactStore(env),
    comparisonArtifactStore: createComparisonArtifactStore(env),
  };
}
