import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "./localStorageProvider.js";
import { assertSafeStorageKey } from "./types.js";

describe("LocalStorageProvider", () => {
  let rootDir = "";

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("stores and retrieves objects under a safe key prefix", async () => {
    rootDir = await mkdtemp(join(tmpdir(), "reactify-local-storage-"));
    const provider = new LocalStorageProvider(rootDir);
    await provider.putObject("images/test-id", Buffer.from("payload"), {
      contentType: "image/png",
    });

    const loaded = await provider.getObject("images/test-id");
    expect(loaded?.toString()).toBe("payload");
    expect(await provider.objectExists("images/test-id")).toBe(true);
  });

  it("rejects path traversal keys", () => {
    expect(() => assertSafeStorageKey("../escape")).toThrow(/Invalid storage key/);
    expect(() => assertSafeStorageKey("exports/../secret")).toThrow(/Invalid storage key/);
  });

  it("deletes stored objects", async () => {
    rootDir = await mkdtemp(join(tmpdir(), "reactify-local-storage-"));
    const provider = new LocalStorageProvider(rootDir);
    await provider.putObject("exports/gen/export.zip", Buffer.from("zip"));
    await provider.deleteObject("exports/gen/export.zip");
    expect(await provider.getObject("exports/gen/export.zip")).toBeNull();
  });
});

describe("S3StorageProvider", () => {
  it("validates storage keys before network access", async () => {
    const { S3StorageProvider } = await import("./s3StorageProvider.js");
    const provider = new S3StorageProvider({
      endpoint: "https://example.invalid",
      region: "auto",
      bucket: "test-bucket",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    });

    await expect(provider.putObject("../bad-key", Buffer.from("x"))).rejects.toThrow(/Invalid storage key/);
    await expect(provider.getObject("../bad-key")).rejects.toThrow(/Invalid storage key/);
  });
});
