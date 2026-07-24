import { useSystemReadiness } from "./useSystemReadiness.js";

export function SystemReadinessBanner() {
  const readiness = useSystemReadiness();

  if (!readiness || readiness.workerAvailable || readiness.inlineExecution) {
    return null;
  }

  return (
    <div
      className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      role="status"
    >
      Background worker unavailable. {readiness.message ?? "Start the Reactify worker to process generations."}
    </div>
  );
}
