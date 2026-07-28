import { vi } from "vitest";
import type { GenerationSummary } from "@reactify/generation-contracts";

export const mockGenerationSummary: GenerationSummary = {
  generationId: "49189210-714d-431d-ac1c-1554c8cf4c74",
  status: "Ready",
  sourceImageFilename: "landing.png",
  currentStage: null,
  activeVersionNumber: 1,
  latestProjectHash: null,
  latestSimilarityScore: null,
  repairCount: 0,
  editCount: 0,
  versionCount: 1,
  exportCount: 0,
  createdAt: "2026-07-23T12:00:00.000Z",
  updatedAt: "2026-07-23T12:30:00.000Z",
};

export function createMockGenerationHistory(overrides?: { total?: number; items?: GenerationSummary[] }) {
  const items = overrides?.items ?? [mockGenerationSummary];
  return {
    items,
    total: overrides?.total ?? items.length,
    limit: 20,
    offset: 0,
    statusFilter: "",
    isLoading: false,
    error: null,
    setPagination: vi.fn(),
    setStatusFilter: vi.fn(),
    reload: vi.fn(),
  };
}
