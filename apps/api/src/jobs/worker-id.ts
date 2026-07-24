import { createHash, randomUUID } from "node:crypto";

let workerId: string | null = null;

export function getWorkerId(): string {
  if (!workerId) {
    workerId = randomUUID();
  }
  return workerId;
}

export function hashWorkerId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

export function resetWorkerIdForTests(): void {
  workerId = null;
}
