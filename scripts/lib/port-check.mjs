import net from "node:net";
import { execSync } from "node:child_process";

export function findPortOwner(port) {
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

export function inspectPort(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolve({ inUse: true, ...findPortOwner(port) });
        return;
      }
      resolve({ inUse: false, pid: null, command: null });
    });
    server.listen({ port, host }, () => {
      server.close(() => resolve({ inUse: false, pid: null, command: null }));
    });
  });
}

export async function waitForHttpOk(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
