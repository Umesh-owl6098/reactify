import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ExportArtifactStore {
  constructor(private readonly rootDir: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  getRootDir(): string {
    return this.rootDir;
  }

  buildStorageKey(generationId: string, exportId: string): string {
    this.assertSafeId(generationId, "generationId");
    this.assertSafeId(exportId, "exportId");
    return `${generationId}/${exportId}.zip`;
  }

  resolveArchivePath(generationId: string, exportId: string): string {
    const key = this.buildStorageKey(generationId, exportId);
    const resolved = path.resolve(this.rootDir, key);
    const normalizedRoot = path.resolve(this.rootDir);
    if (!resolved.startsWith(`${normalizedRoot}${path.sep}`) && resolved !== normalizedRoot) {
      throw new Error("Export artifact path escapes storage root.");
    }
    return resolved;
  }

  async writeArchive(generationId: string, exportId: string, buffer: Buffer): Promise<string> {
    const filePath = this.resolveArchivePath(generationId, exportId);
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, buffer);
    await rename(tempPath, filePath);
    return this.buildStorageKey(generationId, exportId);
  }

  async readArchive(generationId: string, exportId: string): Promise<Buffer | null> {
    const filePath = this.resolveArchivePath(generationId, exportId);
    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  async archiveExists(generationId: string, exportId: string): Promise<boolean> {
    const buffer = await this.readArchive(generationId, exportId);
    return buffer !== null;
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
