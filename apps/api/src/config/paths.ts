import path from "node:path";
import type { Env } from "../env.js";

export interface AppPaths {
  imageStorageDir: string;
  comparisonStorageDir: string;
  workerPresenceFile: string;
}

export function resolveAppPaths(env: Env, cwd: string = process.cwd()): AppPaths {
  const imageStorageDir = path.resolve(cwd, env.IMAGE_STORAGE_DIR);
  const comparisonStorageDir = path.resolve(cwd, env.VISUAL_COMPARISON_STORAGE_DIR);
  return {
    imageStorageDir,
    comparisonStorageDir,
    workerPresenceFile: path.join(imageStorageDir, ".worker-presence.json"),
  };
}
