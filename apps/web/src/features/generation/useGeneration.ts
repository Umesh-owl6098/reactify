import { useCallback, useEffect } from "react";
import {
  fetchGenerationStatus,
  isTerminalGenerationStatus,
  startGeneration,
} from "../../lib/generation-api";
import { useGenerationStore } from "./generationStore";

const POLL_INTERVAL_MS = 2000;

export function useGeneration() {
  const generationId = useGenerationStore((state) => state.generationId);
  const status = useGenerationStore((state) => state.status);
  const error = useGenerationStore((state) => state.error);
  const isPolling = useGenerationStore((state) => state.isPolling);
  const setGenerationId = useGenerationStore((state) => state.setGenerationId);
  const setStatus = useGenerationStore((state) => state.setStatus);
  const setError = useGenerationStore((state) => state.setError);
  const setPolling = useGenerationStore((state) => state.setPolling);
  const reset = useGenerationStore((state) => state.reset);

  const beginGeneration = useCallback(
    async (imageId: string) => {
      try {
        setPolling(true);
        const id = await startGeneration(imageId);
        setGenerationId(id);
        const initialStatus = await fetchGenerationStatus(id);
        setStatus(initialStatus);

        if (isTerminalGenerationStatus(initialStatus.status)) {
          setPolling(false);
        }
      } catch {
        setError("Unable to start generation. Upload an image and try again.");
      }
    },
    [setError, setGenerationId, setPolling, setStatus],
  );

  useEffect(() => {
    if (!generationId || !isPolling) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const nextStatus = await fetchGenerationStatus(generationId);
        setStatus(nextStatus);

        if (isTerminalGenerationStatus(nextStatus.status)) {
          setPolling(false);
        }
      } catch {
        setError("Generation polling failed.");
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generationId, isPolling, setError, setPolling, setStatus]);

  const resumePolling = useCallback(async () => {
    if (!generationId) {
      return;
    }

    setPolling(true);
    setError("");
    const nextStatus = await fetchGenerationStatus(generationId);
    setStatus(nextStatus);

    if (isTerminalGenerationStatus(nextStatus.status)) {
      setPolling(false);
    }
  }, [generationId, setError, setPolling, setStatus]);

  return {
    generationId,
    status,
    error,
    isPolling,
    beginGeneration,
    resumePolling,
    reset,
  };
}
