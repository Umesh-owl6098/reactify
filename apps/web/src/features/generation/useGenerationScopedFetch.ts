import { useCallback, useEffect, useRef } from "react";

interface UseGenerationScopedFetchOptions {
  generationId: string | null;
  enabled?: boolean;
  onGenerationChange?: () => void;
}

export interface GenerationFetchScope {
  generationId: string;
  /**
   * True once the component has moved on to a different generation. Callers must
   * check this before writing a response into a shared store, otherwise a slow
   * request for generation A can overwrite generation B's data.
   */
  isStale: () => boolean;
}

export function useGenerationScopedFetch({
  generationId,
  enabled = true,
  onGenerationChange,
}: UseGenerationScopedFetchOptions) {
  const loadedGenerationIdRef = useRef<string | null>(null);
  const currentGenerationIdRef = useRef<string | null>(generationId);
  const inflightRef = useRef<Promise<void> | null>(null);
  const notifiedGenerationIdRef = useRef<string | null>(null);

  // Tracked during render rather than in an effect. An effect runs a tick after
  // the component has already switched generations, and a request that resolves
  // inside that window would pass `isStale()` and write the previous
  // generation's records into a shared store.
  if (currentGenerationIdRef.current !== generationId) {
    currentGenerationIdRef.current = generationId;
    loadedGenerationIdRef.current = null;
    inflightRef.current = null;
  }

  useEffect(() => {
    if (notifiedGenerationIdRef.current === generationId) {
      return;
    }

    notifiedGenerationIdRef.current = generationId;
    onGenerationChange?.();
  }, [generationId, onGenerationChange]);

  const runFetch = useCallback(
    async (fetcher: (scope: GenerationFetchScope) => Promise<void>, options?: { force?: boolean }) => {
      if (!generationId || !enabled) {
        return;
      }

      if (!options?.force && loadedGenerationIdRef.current === generationId) {
        return;
      }

      if (inflightRef.current) {
        await inflightRef.current;
        if (!options?.force && loadedGenerationIdRef.current === generationId) {
          return;
        }
      }

      const scope: GenerationFetchScope = {
        generationId,
        isStale: () => currentGenerationIdRef.current !== generationId,
      };

      const request = (async () => {
        await fetcher(scope);
        if (!scope.isStale()) {
          loadedGenerationIdRef.current = generationId;
        }
      })();

      inflightRef.current = request.finally(() => {
        if (inflightRef.current === request) {
          inflightRef.current = null;
        }
      });

      await inflightRef.current;
    },
    [enabled, generationId],
  );

  return { runFetch };
}
