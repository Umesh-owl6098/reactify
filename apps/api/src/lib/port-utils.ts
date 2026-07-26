import net from "node:net";
import { execSync } from "node:child_process";

export interface PortUsage {
  inUse: boolean;
  pid: number | null;
  command: string | null;
}

export function inspectPortAsync(host: string, port: number): Promise<PortUsage> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve({
          inUse: true,
          ...findPortOwner(port),
        });
        return;
      }
      resolve({ inUse: false, pid: null, command: null });
    });
    server.listen({ port, host }, () => {
      server.close(() => {
        resolve({ inUse: false, pid: null, command: null });
      });
    });
  });
}

export async function listenWithDevRetry(
  listen: () => Promise<void>,
  options: { port: number; host: string; maxAttempts?: number; delayMs?: number },
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 12;
  const delayMs = options.delayMs ?? 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await listen();
      return;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
      if (code !== "EADDRINUSE" || attempt === maxAttempts) {
        throw error;
      }
      const owner = findPortOwner(options.port);
      console.warn({
        event: "api_listen_retry",
        attempt,
        port: options.port,
        host: options.host,
        pid: owner.pid,
        command: owner.command,
        message: "Port busy during dev restart; retrying listen.",
      });
      await sleep(delayMs);
    }
  }
}

function findPortOwner(port: number): { pid: number | null; command: string | null } {
  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN`, { encoding: "utf8" }).trim();
    const line = output.split("\n")[1];
    if (!line) {
      return { pid: null, command: null };
    }
    const parts = line.trim().split(/\s+/);
    return {
      command: parts[0] ?? null,
      pid: parts[1] ? Number.parseInt(parts[1], 10) : null,
    };
  } catch {
    return { pid: null, command: null };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
