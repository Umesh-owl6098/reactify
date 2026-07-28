import { loadLocalEnv } from "./lib/load-local-env.js";
import { validateEnv } from "./env.js";
import { buildWorker } from "./worker-bootstrap.js";
import { registerProcessLifecycle } from "./lib/process-lifecycle.js";
import { resolveConfiguredAIModels } from "./providers/ai-provider-config.js";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const { runner, shutdown } = await buildWorker(env);

  registerProcessLifecycle({
    role: "worker",
    onShutdown: async () => {
      await runner.stop();
      await shutdown();
    },
  });

  runner.start();
  console.info("Reactify worker ready and polling for jobs");
  console.info({
    event: "worker_started",
    pollIntervalMs: env.JOB_WORKER_POLL_INTERVAL_MS,
    workerConcurrency: env.WORKER_CONCURRENCY,
    aiProvider: env.AI_PROVIDER,
    aiModels: resolveConfiguredAIModels(env),
  });
}

void main();
