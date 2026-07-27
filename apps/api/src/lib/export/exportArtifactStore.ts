import { createHash } from "node:crypto";
import type { LocalStorageProvider } from "../storage/localStorageProvider.js";
import type { StorageProvider } from "../storage/types.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ExportArtifactStore {
  constructor(private readonly storage: StorageProvider) {}

  async ensureReady(): Promise<void> {
    // Object storage does not require local directory initialization.
  }

  getRootDir(): string {
    if ("getRootDir" in this.storage && typeof this.storage.getRootDir === "function") {
      return (this.storage as LocalStorageProvider).getRootDir();
    }
    return "s3";
  }

  buildStorageKey(generationId: string, exportId: string): string {
    this.assertSafeId(generationId, "generationId");
    this.assertSafeId(exportId, "exportId");
    return `exports/${generationId}/${exportId}.zip`;
  }

  resolveArchivePath(generationId: string, exportId: string): string {
    const key = this.buildStorageKey(generationId, exportId);
    if ("resolvePhysicalPath" in this.storage && typeof this.storage.resolvePhysicalPath === "function") {
      return (this.storage as LocalStorageProvider).resolvePhysicalPath(key);
    }
    return key;
  }

  async writeArchive(generationId: string, exportId: string, buffer: Buffer): Promise<string> {
    const key = this.buildStorageKey(generationId, exportId);
    await this.storage.putObject(key, buffer, {
      contentType: "application/zip",
      contentLength: buffer.length,
    });
    return key;
  }

  async readArchive(generationId: string, exportId: string): Promise<Buffer | null> {
    const key = this.buildStorageKey(generationId, exportId);
    return this.storage.getObject(key);
  }

  async archiveExists(generationId: string, exportId: string): Promise<boolean> {
    const key = this.buildStorageKey(generationId, exportId);
    return this.storage.objectExists(key);
  }

  computeChecksum(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  private assertSafeId(value: string, label: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new Error(`Invalid export ${label}.`);
    }
  }
}
