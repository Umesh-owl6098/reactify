import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "../lib/storage/types.js";

export interface WorkerPresenceSnapshot {
  lastSeenAt: string;
  pollIntervalMs: number;
  workerConcurrency: number;
  registeredHandlers: string[];
}

const DEFAULT_STALE_MS = 30_000;

export interface WorkerPresenceStore {
  record(snapshot: Omit<WorkerPresenceSnapshot, "lastSeenAt">): Promise<void>;
  read(): Promise<WorkerPresenceSnapshot | null>;
}

export function createWorkerPresenceStore(input: {
  storage?: StorageProvider;
  presenceKey?: string;
  presenceFile?: string;
}): WorkerPresenceStore {
  if (input.storage && input.presenceKey) {
    return createStorageWorkerPresenceStore(input.storage, input.presenceKey);
  }

  if (input.presenceFile) {
    return createFileWorkerPresenceStore(input.presenceFile);
  }

  throw new Error("Worker presence store requires storage or a presence file path.");
}

function createStorageWorkerPresenceStore(storage: StorageProvider, presenceKey: string): WorkerPresenceStore {
  return {
    async record(snapshot) {
      const payload: WorkerPresenceSnapshot = {
        ...snapshot,
        lastSeenAt: new Date().toISOString(),
      };
      await storage.putObject(presenceKey, Buffer.from(JSON.stringify(payload)), {
        contentType: "application/json",
      });
    },
    async read() {
      const raw = await storage.getObject(presenceKey);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw.toString("utf8")) as WorkerPresenceSnapshot;
      } catch {
        return null;
      }
    },
  };
}

function createFileWorkerPresenceStore(presenceFile: string): WorkerPresenceStore {
  return {
    async record(snapshot) {
      await mkdir(path.dirname(presenceFile), { recursive: true });
      const payload: WorkerPresenceSnapshot = {
        ...snapshot,
        lastSeenAt: new Date().toISOString(),
      };
      await writeFile(presenceFile, JSON.stringify(payload), "utf8");
    },
    async read() {
      try {
        const raw = await readFile(presenceFile, "utf8");
        return JSON.parse(raw) as WorkerPresenceSnapshot;
      } catch {
        return null;
      }
    },
  };
}

export async function recordWorkerPresence(
  presenceTarget: string | WorkerPresenceStore,
  snapshot: Omit<WorkerPresenceSnapshot, "lastSeenAt">,
): Promise<void> {
  if (typeof presenceTarget === "string") {
    await createFileWorkerPresenceStore(presenceTarget).record(snapshot);
    return;
  }
  await presenceTarget.record(snapshot);
}

export async function readWorkerPresence(
  presenceTarget: string | WorkerPresenceStore,
): Promise<WorkerPresenceSnapshot | null> {
  if (typeof presenceTarget === "string") {
    return createFileWorkerPresenceStore(presenceTarget).read();
  }
  return presenceTarget.read();
}

export function isWorkerPresenceFresh(
  snapshot: WorkerPresenceSnapshot | null,
  staleAfterMs: number = DEFAULT_STALE_MS,
): boolean {
  if (!snapshot?.lastSeenAt) {
    return false;
  }

  const ageMs = Date.now() - new Date(snapshot.lastSeenAt).getTime();
  return ageMs <= staleAfterMs;
}
