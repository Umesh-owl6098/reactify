import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGenerationScopedFetch } from "./useGenerationScopedFetch";

describe("useGenerationScopedFetch", () => {
  it("deduplicates repeated fetch requests for the same generation", async () => {
    const fetcher = vi.fn(async () => undefined);

    const { result, rerender } = renderHook(
      ({ generationId }) =>
        useGenerationScopedFetch({
          generationId,
        }),
      { initialProps: { generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba" as string | null } },
    );

    await result.current.runFetch(fetcher);
    await result.current.runFetch(fetcher);
    await result.current.runFetch(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba" });
    await result.current.runFetch(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("allows forced refetch after initial load", async () => {
    const fetcher = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useGenerationScopedFetch({
        generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
      }),
    );

    await result.current.runFetch(fetcher);
    await result.current.runFetch(fetcher, { force: true });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("resets dedupe state when generation id changes", async () => {
    const fetcher = vi.fn(async () => undefined);

    const { result, rerender } = renderHook(
      ({ generationId }) =>
        useGenerationScopedFetch({
          generationId,
        }),
      { initialProps: { generationId: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba" as string | null } },
    );

    await result.current.runFetch(fetcher);
    rerender({ generationId: "924ae008-db1d-44ed-97b7-2019de8b6bf4" });
    await waitFor(async () => {
      await result.current.runFetch(fetcher);
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
