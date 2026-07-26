import { useCallback, useEffect, useRef } from "react";
import {
  fetchGenerationStatus,
  GenerationApiRequestError,
  isTerminalGenerationStatus,
  mapGenerationLoadError,
  startGeneration,
} from "../../lib/generation-api";
import { useJobStore } from "../jobs/jobStore";
import { useGenerationStore } from "./generationStore";

const BASE_POLL_INTERVAL_MS = 2000;
const MAX_POLL_INTERVAL_MS = 15000;
const LOADING_TIMEOUT_MS = 30_000;

export function useGeneration() {
  const generationId = useGenerationStore((state) => state.generationId);
  const status = useGenerationStore((state) => state.status);
  const error = useGenerationStore((state) => state.error);
  const isLoading = useGenerationStore((state) => state.isLoading);
  const isPolling = useGenerationStore((state) => state.isPolling);
  const setGenerationId = useGenerationStore((state) => state.setGenerationId);
  const setStatus = useGenerationStore((state) => state.setStatus);
  const setError = useGenerationStore((state) => state.setError);
  const setLoading = useGenerationStore((state) => state.setLoading);
  const setPolling = useGenerationStore((state) => state.setPolling);
  const reset = useGenerationStore((state) => state.reset);
  const setActiveJobId = useJobStore((state) => state.setActiveJobId);
  const statusVersionRef = useRef(0);

  const beginGeneration = useCallback(
    async (imageId: string): Promise<string> => {
      try {
        setLoading(true);
        setError(null);
        setPolling(true);
        const { generationId: id, jobId } = await startGeneration(imageId);
        setGenerationId(id);
        if (jobId) {
          setActiveJobId(jobId);
        }
        const initialStatus = await fetchGenerationStatus(id);
        statusVersionRef.current += 1;
        setStatus(initialStatus);

        if (isTerminalGenerationStatus(initialStatus.status)) {
          setPolling(false);
          setActiveJobId(null);
        }
        return id;
      } catch (loadError) {
        setError(mapGenerationLoadError(loadError, "Unable to start generation. Upload an image and try again."));
        setPolling(false);
        throw new Error("Unable to start generation.");
      } finally {
        setLoading(false);
      }
    },
    [setActiveJobId, setError, setGenerationId, setLoading, setPolling, setStatus],
  );

  const loadGeneration = useCallback(
    async (id: string) => {
      const requestId = useGenerationStore.getState().loadRequestId;

      try {
        const initialStatus = await fetchGenerationStatus(id);
        if (requestId !== useGenerationStore.getState().loadRequestId) {
          return;
        }
        if (initialStatus.id !== id) {
          return;
        }

        statusVersionRef.current += 1;
        setStatus(initialStatus);
        setError(null);
        setPolling(!isTerminalGenerationStatus(initialStatus.status));
        if (isTerminalGenerationStatus(initialStatus.status)) {
          setActiveJobId(null);
        }
      } catch (loadError) {
        if (requestId !== useGenerationStore.getState().loadRequestId) {
          return;
        }

        setStatus(null);
        setError(mapGenerationLoadError(loadError, "This generation is unavailable or may have been deleted."));
        setPolling(false);
        setActiveJobId(null);
      } finally {
        if (requestId === useGenerationStore.getState().loadRequestId) {
          setLoading(false);
        }
      }
    },
    [setActiveJobId, setError, setLoading, setPolling, setStatus],
  );

  useEffect(() => {
    if (!generationId || !isPolling) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let failureCount = 0;

    const schedule = (delayMs: number) => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (cancelled) {
        return;
      }

      try {
        const nextStatus = await fetchGenerationStatus(generationId);
        if (cancelled) {
          return;
        }

        statusVersionRef.current += 1;
        setStatus(nextStatus);
        setError(null);
        failureCount = 0;

        if (isTerminalGenerationStatus(nextStatus.status)) {
          setPolling(false);
          setActiveJobId(null);
          return;
        }
      } catch (pollError) {
        if (!cancelled) {
          failureCount += 1;
          if (failureCount >= 5) {
            setError(mapGenerationLoadError(pollError, "Generation polling failed."));
          }
        }
      }

      if (cancelled || !useGenerationStore.getState().isPolling) {
        return;
      }

      const hidden = document.visibilityState === "hidden";
      const backoff = Math.min(BASE_POLL_INTERVAL_MS * 2 ** Math.min(failureCount, 3), MAX_POLL_INTERVAL_MS);
      schedule(hidden ? backoff * 2 : backoff);
    };

    void tick();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && useGenerationStore.getState().isPolling) {
        schedule(BASE_POLL_INTERVAL_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [generationId, isPolling, setActiveJobId, setError, setPolling, setStatus]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const state = useGenerationStore.getState();
      if (state.isLoading && !state.status && !state.error) {
        setError("Loading is taking longer than expected. Retry or check that the API and worker are running.");
      }
    }, LOADING_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [generationId, isLoading, setError]);

  const resumePolling = useCallback(async () => {
    if (!generationId) {
      return;
    }

    setPolling(true);
    setError(null);
    try {
      const nextStatus = await fetchGenerationStatus(generationId);
      statusVersionRef.current += 1;
      setStatus(nextStatus);
      setError(null);

      if (isTerminalGenerationStatus(nextStatus.status)) {
        setPolling(false);
        setActiveJobId(null);
      }
    } catch (pollError) {
      setError(mapGenerationLoadError(pollError, "Generation polling failed."));
      setPolling(false);
    }
  }, [generationId, setActiveJobId, setError, setPolling, setStatus]);

  return {
    generationId,
    status,
    error,
    isLoading,
    isPolling,
    beginGeneration,
    loadGeneration,
    resumePolling,
    reset,
  };
}

export function isGenerationApiAuthError(error: unknown): boolean {
  return error instanceof GenerationApiRequestError && error.code === "AUTHENTICATION_REQUIRED";
}
