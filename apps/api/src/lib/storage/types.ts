import type { Readable } from "node:stream";

export interface StorageObjectMetadata {
  contentType?: string;
  contentLength?: number;
}

export interface StorageProvider {
  putObject(key: string, body: Buffer, metadata?: StorageObjectMetadata): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  objectExists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  getDownloadStream?(key: string): Promise<Readable | null>;
}

const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9/_\-.]*$/i;

export function assertSafeStorageKey(key: string): void {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) {
    throw new Error("Invalid storage key.");
  }

  const segments = key.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Invalid storage key.");
  }

  if (!STORAGE_KEY_PATTERN.test(key)) {
    throw new Error("Invalid storage key.");
  }
}
