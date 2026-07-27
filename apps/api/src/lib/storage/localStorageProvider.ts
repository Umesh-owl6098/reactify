import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { assertSafeStorageKey, type StorageObjectMetadata, type StorageProvider } from "./types.js";

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  getRootDir(): string {
    return this.rootDir;
  }

  resolvePhysicalPath(key: string): string {
    assertSafeStorageKey(key);
    const resolved = path.resolve(this.rootDir, key);
    const normalizedRoot = path.resolve(this.rootDir);
    if (!resolved.startsWith(`${normalizedRoot}${path.sep}`) && resolved !== normalizedRoot) {
      throw new Error("Storage key escapes local root.");
    }
    return resolved;
  }

  async putObject(key: string, body: Buffer, _metadata?: StorageObjectMetadata): Promise<void> {
    const filePath = this.resolvePhysicalPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, body);
    await rename(tempPath, filePath);
  }

  async getObject(key: string): Promise<Buffer | null> {
    const filePath = this.resolvePhysicalPath(key);
    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const object = await this.getObject(key);
    return object !== null;
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolvePhysicalPath(key);
    await unlink(filePath).catch(() => undefined);
  }

  async getDownloadStream(key: string): Promise<Readable | null> {
    const filePath = this.resolvePhysicalPath(key);
    try {
      return createReadStream(filePath);
    } catch {
      return null;
    }
  }
}
