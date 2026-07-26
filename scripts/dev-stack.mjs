#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPortOwner, inspectPort, waitForHttpOk } from "./lib/port-check.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API_PORT = 3001;
const WEB_PORT = 5174;
const API_HOST = "127.0.0.1";
const MAX_DEV_RESTARTS = 20;

const children = new Map();
let shuttingDown = false;
const restartCounts = { api: 0, worker: 0 };

function log(prefix, message) {
  console.log(`[${prefix}] ${message}`);
}

function pipeOutput(name, child) {
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) {
        log(name, line);
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) {
        log(name, line);
      }
    }
  });
}

function spawnService(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeOutput(name, child);
  children.set(name, child);
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      return;
    }
    log(name, `exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    if (name === "web") {
      log("dev-stack", "Web process exited; shutting down the full stack.");
      void shutdown(1);
      return;
    }
    if (name === "api" || name === "worker") {
      restartCounts[name] += 1;
      if (restartCounts[name] > MAX_DEV_RESTARTS) {
        log("dev-stack", `${name} exceeded restart limit (${MAX_DEV_RESTARTS}); shutting down.`);
        void shutdown(1);
        return;
      }
      log("dev-stack", `Restarting ${name} in 1s (restart ${restartCounts[name]}/${MAX_DEV_RESTARTS})`);
      setTimeout(() => {
        if (!shuttingDown) {
          startService(name);
        }
      }, 1000);
    }
  });
  return child;
}

function startService(name) {
  if (name === "api") {
    spawnService("api", "corepack", ["pnpm", "dev:api"], join(ROOT, "apps/api"));
    return;
  }
  if (name === "worker") {
    spawnService("worker", "corepack", ["pnpm", "dev:worker"], join(ROOT, "apps/api"));
    return;
  }
  if (name === "web") {
    spawnService("web", "corepack", ["pnpm", "dev"], join(ROOT, "apps/web"));
  }
}

async function verifyStartupPorts() {
  const apiUsage = await inspectPort(API_HOST, API_PORT);
  if (apiUsage.inUse) {
    console.error(
      `[dev-stack] Port ${API_PORT} is already in use by PID ${apiUsage.pid ?? "unknown"} (${apiUsage.command ?? "unknown"}). Stop that process before starting Reactify.`,
    );
    process.exit(1);
  }

  const webUsage = await inspectPort("127.0.0.1", WEB_PORT);
  if (webUsage.inUse) {
    console.error(
      `[dev-stack] Port ${WEB_PORT} is already in use by PID ${webUsage.pid ?? "unknown"} (${webUsage.command ?? "unknown"}). Stop that process before starting Reactify.`,
    );
    process.exit(1);
  }
}

async function runHealthChecks() {
  const apiOk = await waitForHttpOk(`http://${API_HOST}:${API_PORT}/health`, 60_000);
  if (!apiOk) {
    log("dev-stack", "API health check failed: http://127.0.0.1:3001/health did not become ready.");
    return false;
  }
  log("dev-stack", "API health check passed.");

  const readinessOk = await waitForHttpOk(`http://${API_HOST}:${API_PORT}/api/v1/system/readiness`, 60_000);
  if (!readinessOk) {
    log("dev-stack", "Worker readiness check failed: /api/v1/system/readiness is not ready yet.");
    return false;
  }
  log("dev-stack", "Worker readiness check passed.");

  const webOk = await waitForHttpOk(`http://127.0.0.1:${WEB_PORT}/`, 60_000);
  if (!webOk) {
    log("dev-stack", "Web availability check failed.");
    return false;
  }
  log("dev-stack", "Web availability check passed.");
  return true;
}

async function monitorHealth() {
  setInterval(async () => {
    if (shuttingDown) {
      return;
    }
    try {
      const response = await fetch(`http://${API_HOST}:${API_PORT}/health`);
      if (!response.ok) {
        log("dev-stack", `API health degraded: HTTP ${response.status}`);
      }
    } catch (error) {
      log("dev-stack", `API health unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 10_000);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log("dev-stack", "Shutting down all processes...");
  for (const [name, child] of children.entries()) {
    log("dev-stack", `Sending SIGTERM to ${name} (pid ${child.pid})`);
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    for (const [, child] of children.entries()) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 3000);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

await verifyStartupPorts();
log("dev-stack", "Starting API, worker, and web...");
startService("api");
startService("worker");
startService("web");

const healthy = await runHealthChecks();
if (!healthy) {
  await shutdown(1);
} else {
  log("dev-stack", `Reactify stack ready. Web: http://localhost:${WEB_PORT} API: http://${API_HOST}:${API_PORT}`);
  void monitorHealth();
}
