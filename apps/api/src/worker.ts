import { validateEnv } from "./env.js";
import { buildWorker } from "./worker-bootstrap.js";

async function main() {
  const env = validateEnv();
  const { runner, shutdown } = await buildWorker(env);

  process.on("unhandledRejection", (reason) => {
    console.error({ event: "worker_unhandled_rejection", reason: reason instanceof Error ? reason.message : String(reason) });
  });

  const handleShutdown = async (signal: string) => {
    console.info({ event: "worker_shutdown_started", signal });
    await runner.stop();
    await shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void handleShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM");
  });

  runner.start();
  console.info("Reactify worker ready and polling for jobs");
  console.info({
    event: "worker_started",
    pollIntervalMs: env.JOB_WORKER_POLL_INTERVAL_MS,
    workerConcurrency: env.WORKER_CONCURRENCY,
    aiProvider: env.AI_PROVIDER,
  });
}

void main();
