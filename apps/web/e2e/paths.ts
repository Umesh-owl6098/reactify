import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Playwright resolves `storageState` against the process cwd but test files
 * against their own location, so every path here is absolute to keep the config
 * and the specs pointing at the same files regardless of where the run started.
 */
export const E2E_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = join(E2E_DIR, "..");
export const REPO_ROOT = join(WEB_DIR, "..", "..");
export const API_DIR = join(REPO_ROOT, "apps", "api");
export const STATE_PATH = join(E2E_DIR, ".auth", "state.json");
