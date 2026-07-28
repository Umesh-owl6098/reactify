import type { StorageProvider } from "./types.js";

/** In-memory storage provider used in unit/integration tests. */
export class MemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, Buffer.from(body));
  }

  async getObject(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }

  async objectExists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  size(): number {
    return this.objects.size;
  }
}
