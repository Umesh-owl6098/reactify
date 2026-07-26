import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PIPELINE_STAGE_ORDER } from "@reactify/generation-contracts";
import { MockAIProvider, generationPlanFixture } from "@reactify/test-utils";
import {
  createSuccessfulSandboxValidationReport,
  waitForAwaitingSandboxValidation,
} from "../test/helpers.js";
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
    repairConfig: {
      maxAttempts: testEnv.MAX_REPAIR_ATTEMPTS,
      maxPatchFileBytes: testEnv.MAX_PATCH_FILE_BYTES,
      maxPatchTotalBytes: testEnv.MAX_PATCH_TOTAL_BYTES,
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
    store = new GenerationStore(DEFAULT_FEATURE_FLAGS, testEnv.MAX_REPAIR_ATTEMPTS);
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

  it("pauses at plan review before code generation", async () => {
    const generationId = store.create({ imageId }).id;
    await runner.run(generationId);

    const record = store.get(generationId);
    expect(record?.status).toBe("Planning");
    expect(record?.awaitingPlanConfirmation).toBe(true);
    expect(record?.outputs.generationPlan).not.toBeNull();
    expect(record?.plan).toMatchObject({ provider: "mock", promptVersion: "1.0.0" });
    expect(record?.outputs.generatedProject).toBeNull();
    expect(record?.stages.some((stage) => stage.stage === "generation_plan_review" && stage.status === "awaiting_confirmation")).toBe(true);
    expect(record?.stages.some((stage) => stage.stage === "react_project_generation")).toBe(false);
  });

  it("resumes after plan confirmation and completes browser-assisted sandbox validation", async () => {
    const generationId = store.create({ imageId }).id;
    await runner.run(generationId);

    const confirmResult = runner.confirmPlan(generationId, generationPlanFixture, false);
    expect(confirmResult.ok).toBe(true);
    await runner.resume(generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const record = store.get(generationId);
      return {
        awaitingSandboxValidation: record?.awaitingSandboxValidation,
        projectHash: record?.projectHash,
      };
    });

    const pausedRecord = store.get(generationId);
    expect(pausedRecord?.activeVersionId).toBe(projectHash);
    expect(pausedRecord?.versions).toHaveLength(1);
    expect(pausedRecord?.outputs.generatedProject).not.toBeNull();

    const submitResult = await runner.submitSandboxValidation(
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
    );
    expect(submitResult.ok).toBe(true);
    if (submitResult.shouldResume) {
      await runner.resumeFromSandbox(generationId);
    }

    const started = Date.now();
    while (Date.now() - started < 5000) {
      const record = store.get(generationId);
      if (record?.status === "Ready") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const record = store.get(generationId);
    expect(record?.status).toBe("Ready");
    expect(record?.confirmedAt).not.toBeNull();
    expect(record?.editedByUser).toBe(false);
    expect(record?.outputs.generatedProject).not.toBeNull();
    expect(record?.sandboxValidation?.compilation.success).toBe(true);
    expect(record?.sandboxValidation?.runtime.success).toBe(true);
  });

  it("sets Ready when runSegment stops after preview_ready", async () => {
    const generationId = store.create({ imageId }).id;
    await runner.run(generationId);

    expect(runner.confirmPlan(generationId, generationPlanFixture, false).ok).toBe(true);
    await runner.resume(generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const record = store.get(generationId);
      return {
        awaitingSandboxValidation: record?.awaitingSandboxValidation,
        projectHash: record?.projectHash,
      };
    });

    await runner.submitSandboxValidation(
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
    );

    const result = await runner.runSegment(generationId, "automatic_repair", { stopAfter: "preview_ready" });
    expect(result.outcome).toBe("completed");
    expect(store.get(generationId)?.status).toBe("Ready");
  });

  it("does not start duplicate resumes on repeated confirmation", async () => {
    const generationId = store.create({ imageId }).id;
    await runner.run(generationId);

    expect(runner.confirmPlan(generationId, generationPlanFixture, false).ok).toBe(true);
    await runner.resume(generationId);

    const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
      const record = store.get(generationId);
      return {
        awaitingSandboxValidation: record?.awaitingSandboxValidation,
        projectHash: record?.projectHash,
      };
    });

    runner.submitSandboxValidation(
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
    );
    await runner.resumeFromSandbox(generationId);

    const started = Date.now();
    while (Date.now() - started < 5000) {
      const record = store.get(generationId);
      if (record?.status === "Ready") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const secondConfirm = runner.confirmPlan(generationId, generationPlanFixture, false);
    expect(secondConfirm.ok).toBe(false);
  });

  it("marks the pipeline failed when mock failure stage is configured", async () => {
    const failingRunner = new PipelineRunner(
      createDefaultRegistry(createStageExecutors(imageStorage)),
      store,
      imageStorage,
      DEFAULT_FEATURE_FLAGS,
      {
        ...createRunnerServices(),
        mockFailureStage: "design_analysis",
      },
    );
    const generationId = store.create({ imageId }).id;
    await failingRunner.run(generationId);

    const record = store.get(generationId);
    expect(record?.status).toBe("Failed");
    expect(record?.errors[0]?.stage).toBe("design_analysis");
    expect(record?.errors[0]?.code).toBe("MOCK_FAILURE_INJECTED");
  });

  it("does not fail design analysis when generation failStage metadata is set", async () => {
    const generationId = store.create({ imageId }).id;
    store.markFailed(generationId, "design_analysis", "JOB_ENQUEUE_FAILED", "queue unavailable", {
      manualRetryAllowed: true,
    });
    store.recoverFromWorkerFailure(generationId, "design_analysis");

    const result = await runner.runSegment(generationId, undefined, { stopAfter: "design_analysis" });
    expect(result.outcome).toBe("completed");
    expect(store.get(generationId)?.outputs.designAnalysis).not.toBeNull();
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

    expect(stageNames).toEqual(
      expect.arrayContaining(["upload_validation", "design_analysis", "generation_plan_review"]),
    );
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
