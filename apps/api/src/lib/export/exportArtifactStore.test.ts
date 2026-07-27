import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExportArtifactStore } from "./exportArtifactStore.js";
import { LocalStorageProvider } from "../storage/localStorageProvider.js";

describe("ExportArtifactStore", () => {
  let rootDir = "";
  let store: ExportArtifactStore;

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  async function createStore() {
    rootDir = await mkdtemp(join(tmpdir(), "reactify-export-store-"));
    store = new ExportArtifactStore(new LocalStorageProvider(rootDir));
    await store.ensureReady();
  }

  it("writes and reads archives using a stable storage key", async () => {
    await createStore();
    const generationId = "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
    const exportId = "75e42c99-fef8-4f43-964c-b9918c28a0ea";
    const buffer = Buffer.from("zip-content");

    const key = await store.writeArchive(generationId, exportId, buffer);
    expect(key).toBe(`exports/${generationId}/${exportId}.zip`);

    const loaded = await store.readArchive(generationId, exportId);
    expect(loaded?.equals(buffer)).toBe(true);
  });

  it("rejects path traversal via invalid ids", async () => {
    await createStore();
    await expect(store.readArchive("../escape", "75e42c99-fef8-4f43-964c-b9918c28a0ea")).rejects.toThrow(
      /Invalid export generationId/,
    );
  });

  it("returns null when the archive file is missing", async () => {
    await createStore();
    const missing = await store.readArchive(
      "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8",
      "75e42c99-fef8-4f43-964c-b9918c28a0ea",
    );
    expect(missing).toBeNull();
  });

  it("computes deterministic checksums", async () => {
    await createStore();
    const buffer = Buffer.from("export-checksum");
    expect(store.computeChecksum(buffer)).toBe(store.computeChecksum(buffer));
  });

  it("prevents resolving archives outside the storage root", async () => {
    await createStore();
    expect(() =>
      store.resolveArchivePath("8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8", "75e42c99-fef8-4f43-964c-b9918c28a0ea"),
    ).not.toThrow();
    expect(await store.readArchive("8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8", "75e42c99-fef8-4f43-964c-b9918c28a0ea")).toBeNull();
  });
});
