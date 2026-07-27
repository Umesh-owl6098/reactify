import type { Env } from "../../env.js";
import { ImageStorage } from "../imageStorage.js";
import { ExportArtifactStore } from "../export/exportArtifactStore.js";
import { ComparisonArtifactStore } from "../visual-comparison/comparisonArtifactStore.js";
import { LocalStorageProvider } from "./localStorageProvider.js";
import { S3StorageProvider } from "./s3StorageProvider.js";
import type { StorageProvider } from "./types.js";

export interface AppStorage {
  provider: StorageProvider;
  localRootDir: string | null;
  workerPresenceKey: string;
}

export function createAppStorage(env: Env, cwd: string = process.cwd()): AppStorage {
  const workerPresenceKey = "system/worker-presence.json";

  if (env.STORAGE_DRIVER === "s3") {
    return {
      provider: new S3StorageProvider({
        endpoint: env.S3_ENDPOINT!,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET!,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      }),
      localRootDir: null,
      workerPresenceKey,
    };
  }

  const localRootDir = env.STORAGE_LOCAL_ROOT.startsWith("/")
    ? env.STORAGE_LOCAL_ROOT
    : `${cwd}/${env.STORAGE_LOCAL_ROOT}`;

  return {
    provider: new LocalStorageProvider(localRootDir),
    localRootDir,
    workerPresenceKey,
  };
}

export function createImageStorage(env: Env, cwd: string = process.cwd()): ImageStorage {
  return new ImageStorage(createAppStorage(env, cwd).provider);
}

export function createExportArtifactStore(env: Env, cwd: string = process.cwd()): ExportArtifactStore {
  return new ExportArtifactStore(createAppStorage(env, cwd).provider);
}

export function createComparisonArtifactStore(env: Env, cwd: string = process.cwd()): ComparisonArtifactStore {
  return new ComparisonArtifactStore(createAppStorage(env, cwd).provider);
}
