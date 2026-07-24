import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PIPELINE_STAGE_ORDER } from "@reactify/generation-contracts";
import { MockAIProvider } from "@reactify/test-utils";
import { PipelineRunner } from "./PipelineRunner.js";
import { StageRegistry, createDefaultRegistry } from "./registry.js";
import { createStageExecutors } from "./stages/index.js";
import { GenerationStore } from "./store.js";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { ImageStorage } from "../lib/imageStorage.js";
import { defaultLoadPrompt } from "../prompts/loader.js";
import { createTestImage, testEnv } from "../test/helpers.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createRunnerServices() {
  return {
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    aiConfig: {
      model: testEnv.ANTHROPIC_MODEL,
      temperature: testEnv.AI_TEMPERATURE,
      maxTokens: testEnv.AI_MAX_TOKENS,
      timeoutMs: testEnv.AI_TIMEOUT_MS,
    },
  };
}

describe("PipelineRunner", () => {
  let storageDir = "";
  let imageStorage: ImageStorage;
  let store: GenerationStore;
  let runner: PipelineRunner;
  let imageId = "";

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "reactify-pipeline-"));
    imageStorage = new ImageStorage(storageDir);
    imageId = await createTestImage(storageDir);
    store = new GenerationStore();
    const registry = createDefaultRegistry(createStageExecutors(imageStorage));
    runner = new PipelineRunner(
      registry,
      store,
      imageStorage,
      DEFAULT_FEATURE_FLAGS,
      createRunnerServices(),
    );
  });

  afterEach(async () => {
    // temp dirs cleaned by OS
  });

  it("runs a successful pipeline through all stages", async () => {
    const generationId = store.create({ imageId }).id;
    await runner.run(generationId);

    const record = store.get(generationId);
    expect(record?.status).toBe("Ready");
    expect(record?.outputs.designAnalysis).not.toBeNull();
    expect(record?.analysis).toMatchObject({
      provider: "mock",
      promptVersion: "1.0.0",
    });
    expect(record?.outputs.generationPlan).not.toBeNull();
    expect(record?.outputs.generatedProject).not.toBeNull();
    expect(record?.stages.some((stage) => stage.stage === "preview_ready" && stage.status === "completed")).toBe(
      true,
    );
  });

  it("marks the pipeline failed when a stage fails", async () => {
    const generationId = store.create({ imageId, failStage: "design_analysis" }).id;
    await runner.run(generationId);

    const record = store.get(generationId);
    expect(record?.status).toBe("Failed");
    expect(record?.errors[0]?.stage).toBe("design_analysis");
  });

  it("marks the pipeline cancelled when cancelled mid-run", async () => {
    const generationId = store.create({ imageId }).id;
    const runPromise = runner.run(generationId);
    store.cancel(generationId);
    await runPromise;

    const record = store.get(generationId);
    expect(record?.status).toBe("Cancelled");
  });

  it("records user-visible status transitions across stages", async () => {
    const generationId = store.create({ imageId }).id;
    await runner.run(generationId);

    const record = store.get(generationId);
    const stageNames = record?.stages.map((entry) => entry.stage) ?? [];

    expect(stageNames).toEqual(expect.arrayContaining(["upload_validation", "design_analysis", "preview_ready"]));
    expect(record?.durations).toBeUndefined();
    expect(store.toSnapshot(record!).durations.totalMs).toBeGreaterThanOrEqual(0);
  });
});

describe("StageRegistry", () => {
  it("rejects duplicate and invalid stage registration", () => {
    const registry = new StageRegistry();
    const executor = async () => ({
      status: "completed" as const,
      durationMs: 0,
    });

    registry.register("upload_validation", executor);
    expect(() => registry.register("upload_validation", executor)).toThrow(/already registered/);
    expect(() => registry.register("not-a-stage" as "upload_validation", executor)).toThrow(
      /not a valid pipeline stage/,
    );
    expect(registry.list()).toHaveLength(1);
    expect(PIPELINE_STAGE_ORDER.every((stage) => typeof stage === "string")).toBe(true);
  });
});
