import { useState } from "react";
import { retryGeneration } from "../../lib/generation-api";
import { useSystemReadiness } from "../system/useSystemReadiness";

interface GenerationFailureRetryProps {
  generationId: string;
  onRetried: () => void;
}

export function GenerationFailureRetry({ generationId, onRetried }: GenerationFailureRetryProps) {
  const readiness = useSystemReadiness();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3">
      <p className="text-sm text-indigo-100">
        Retry queues a new background design-analysis job for this generation without creating a new project.
      </p>
      {readiness && !readiness.workerAvailable && !readiness.inlineExecution ? (
        <p className="mt-2 text-xs text-amber-100">
          Background worker unavailable. {readiness.message ?? "Start the Reactify worker before retrying."}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-3 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await retryGeneration(generationId);
            onRetried();
          } catch (retryError) {
            setError(retryError instanceof Error ? retryError.message : "Retry failed.");
          } finally {
            setPending(false);
          }
        }}
      >
        Retry
      </button>
    </div>
  );
}
