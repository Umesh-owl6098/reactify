import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separator = trimmed.indexOf("=");
  if (separator <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function applyEnvFile(path: string, override: boolean): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const overridden: string[] = [];
  const content = readFileSync(path, "utf8");

  for (const line of content.split("\n")) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const previous = process.env[parsed.key];
    if (override || previous === undefined) {
      if (override && previous !== undefined && previous !== parsed.value) {
        overridden.push(parsed.key);
      }
      process.env[parsed.key] = parsed.value;
    }
  }

  return overridden;
}

/**
 * Loads apps/api/.env so local file values win over inherited shell exports
 * (for example AI_PROVIDER=mock from test runners).
 */
export function loadLocalEnv(options?: { override?: boolean; apiRootDir?: string }): void {
  const root = options?.apiRootDir ?? apiRoot;
  const override =
    options?.override ??
    process.env.REACTIFY_ENV_FILE_OVERRIDE?.trim().toLowerCase() !== "false";
  const overridden = applyEnvFile(resolve(root, ".env"), override);

  if (overridden.length > 0) {
    console.info({
      event: "env_file_override_applied",
      keys: overridden,
      aiProvider: process.env.AI_PROVIDER,
      envFile: resolve(root, ".env"),
    });
  }
}

export function resolveApiRootDir(): string {
  return apiRoot;
}
