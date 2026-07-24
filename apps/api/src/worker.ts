import { validateEnv } from "./env.js";
import { buildWorker } from "./worker-bootstrap.js";

async function main() {
  const env = validateEnv();
  const { runner, shutdown } = await buildWorker(env);

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
  console.info({ event: "worker_started" });
}

void main();
