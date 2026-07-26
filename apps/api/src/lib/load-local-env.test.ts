import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "./load-local-env.js";

describe("loadLocalEnv", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.LOAD_LOCAL_ENV_TEST;
  });

  it("overrides inherited shell exports when override is enabled", () => {
    tempDir = mkdtempSync(join(tmpdir(), "reactify-env-"));
    process.env.LOAD_LOCAL_ENV_TEST = "from-shell";
    writeFileSync(join(tempDir, ".env"), "LOAD_LOCAL_ENV_TEST=from-file\n", "utf8");

    loadLocalEnv({ apiRootDir: tempDir, override: true });

    expect(process.env.LOAD_LOCAL_ENV_TEST).toBe("from-file");
  });

  it("does nothing when env file is missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "reactify-env-"));
    process.env.LOAD_LOCAL_ENV_TEST = "from-shell";

    loadLocalEnv({ apiRootDir: tempDir, override: true });

    expect(process.env.LOAD_LOCAL_ENV_TEST).toBe("from-shell");
    expect(existsSync(join(tempDir, ".env"))).toBe(false);
  });
});
