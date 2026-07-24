import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface WorkerPresenceSnapshot {
  lastSeenAt: string;
  pollIntervalMs: number;
  workerConcurrency: number;
  registeredHandlers: string[];
}

const DEFAULT_STALE_MS = 30_000;

export async function recordWorkerPresence(
  presenceFile: string,
  snapshot: Omit<WorkerPresenceSnapshot, "lastSeenAt">,
): Promise<void> {
  await mkdir(path.dirname(presenceFile), { recursive: true });
  const payload: WorkerPresenceSnapshot = {
    ...snapshot,
    lastSeenAt: new Date().toISOString(),
  };
  await writeFile(presenceFile, JSON.stringify(payload), "utf8");
}

export async function readWorkerPresence(
  presenceFile: string,
): Promise<WorkerPresenceSnapshot | null> {
  try {
    const raw = await readFile(presenceFile, "utf8");
    return JSON.parse(raw) as WorkerPresenceSnapshot;
  } catch {
    return null;
  }
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
