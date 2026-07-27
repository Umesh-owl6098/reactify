import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "../lib/storage/localStorageProvider.js";
import { ErrorCode, DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImageStorage } from "../lib/imageStorage.js";
import { defaultLoadPrompt } from "../prompts/loader.js";
import { createAIProvider } from "../providers/providerFactory.js";
import { createTestImage, testEnv } from "../test/helpers.js";
import { PipelineRunner } from "./PipelineRunner.js";
import { createDefaultRegistry } from "./registry.js";
import { createStageExecutors } from "./stages/index.js";
import { GenerationStore } from "./store.js";
import { resolveMockFailureStage } from "./mock-failure-stage.js";
import { MockAIProvider } from "@reactify/test-utils";

function createRunner(store: GenerationStore, imageStorage: ImageStorage, mockFailureStage?: string) {
  const registry = createDefaultRegistry(createStageExecutors(imageStorage));
  return new PipelineRunner(registry, store, imageStorage, DEFAULT_FEATURE_FLAGS, {
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    aiConfig: {
      model: testEnv.ANTHROPIC_MODEL,
      temperature: testEnv.AI_TEMPERATURE,
      maxTokens: testEnv.AI_MAX_TOKENS,
      timeoutMs: testEnv.AI_TIMEOUT_MS,
    },
    repairConfig: {
      maxAttempts: testEnv.MAX_REPAIR_ATTEMPTS,
      maxPatchFileBytes: testEnv.MAX_PATCH_FILE_BYTES,
      maxPatchTotalBytes: testEnv.MAX_PATCH_TOTAL_BYTES,
    },
    mockFailureStage: resolveMockFailureStage(mockFailureStage),
  });
}

describe("mock failure injection", () => {
  let storageDir = "";
  let imageStorage: ImageStorage;
  let store: GenerationStore;
  let imageId = "";

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "reactify-mock-failure-"));
    imageStorage = new ImageStorage(new LocalStorageProvider(storageDir));
    imageId = await createTestImage(storageDir);
    store = new GenerationStore(DEFAULT_FEATURE_FLAGS, testEnv.MAX_REPAIR_ATTEMPTS);
  });

  it("succeeds by default with the mock provider", async () => {
    const runner = createRunner(store, imageStorage);
    const generationId = store.create({ ownerId: "owner", imageId }).id;

    const result = await runner.runSegment(generationId, undefined, { stopAfter: "design_analysis" });

    expect(result.outcome).toBe("completed");
    expect(store.get(generationId)?.outputs.designAnalysis).not.toBeNull();
  });

  it("injects failure only when MOCK_AI_FAILURE_STAGE is configured", async () => {
    const runner = createRunner(store, imageStorage, "design_analysis");
    const generationId = store.create({ ownerId: "owner", imageId }).id;

    const result = await runner.runSegment(generationId, undefined, { stopAfter: "design_analysis" });

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.code).toBe("MOCK_FAILURE_INJECTED");
      expect(result.message).toBe("Forced failure at design_analysis");
    }
  });

  it("does not inject failure for the anthropic provider factory path", () => {
    const provider = createAIProvider({
      ...testEnv,
      NODE_ENV: "development",
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
    });
    expect(provider.providerName).toBe("anthropic");
    expect(resolveMockFailureStage(undefined)).toBeUndefined();
  });

  it("advances Failed to Analyzing and Planning after retry without duplicate analysis records", async () => {
    const runner = createRunner(store, imageStorage);
    const record = store.create({ ownerId: "owner", imageId });
    store.markFailed(record.id, "design_analysis", ErrorCode.MOCK_FAILURE_INJECTED, "Forced failure at design_analysis", {
      manualRetryAllowed: true,
    });

    store.recoverFromWorkerFailure(record.id, "design_analysis");
    expect(store.get(record.id)?.status).toBe("Analyzing");
    expect(store.get(record.id)?.failStage).toBeUndefined();

    const analysis = await runner.runSegment(record.id, undefined, { stopAfter: "design_analysis" });
    expect(analysis.outcome).toBe("completed");
    expect(store.get(record.id)?.outputs.designAnalysis).not.toBeNull();
    expect(store.get(record.id)?.errors).toHaveLength(1);

    const planning = await runner.runSegment(record.id, "generation_plan_creation", {
      stopAfter: "generation_plan_review",
    });
    expect(planning.outcome).toBe("paused_plan_review");
    expect(store.get(record.id)?.status).toBe("Planning");
    expect(store.get(record.id)?.outputs.generationPlan).not.toBeNull();
    expect(
      store.get(record.id)?.stages.filter((stage) => stage.stage === "design_analysis"),
    ).toHaveLength(1);
  });
});
