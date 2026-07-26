import { logError, logEvent } from "./structured-log.js";

export interface ProcessLifecycleOptions {
  role: "api" | "worker";
  onShutdown?: (signal: string) => Promise<void>;
}

export function registerProcessLifecycle(options: ProcessLifecycleOptions): void {
  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logEvent(`${options.role}_shutdown_started`, { signal });

    try {
      if (options.onShutdown) {
        await options.onShutdown(signal);
      }
    } catch (error) {
      logError(`${options.role}_shutdown_failed`, error, { signal });
      process.exit(1);
      return;
    }

    logEvent(`${options.role}_shutdown_complete`, { signal, exitCode });
    process.exit(exitCode);
  };

  process.on("unhandledRejection", (reason) => {
    logError(`${options.role}_unhandled_rejection`, reason);
  });

  process.on("uncaughtException", (error) => {
    logError(`${options.role}_uncaught_exception`, error);
    void shutdown("uncaughtException", 1);
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });

  process.on("exit", (code) => {
    logEvent(`${options.role}_process_exit`, { exitCode: code });
  });
}
