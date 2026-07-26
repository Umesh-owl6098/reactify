import { describe, expect, it, vi } from "vitest";
import { MockAIProvider, generationPlanFixture } from "@reactify/test-utils";
import {
  createSuccessfulSandboxValidationReport,
  createTestImage,
  testEnv,
  waitForAwaitingSandboxValidation,
} from "../../test/helpers.js";
import { PipelineRunner } from "../../pipeline/PipelineRunner.js";
import { createDefaultRegistry } from "../../pipeline/registry.js";
import { createStageExecutors } from "../../pipeline/stages/index.js";
import { GenerationStore } from "../../pipeline/store.js";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { ImageStorage } from "../../lib/imageStorage.js";
import { defaultLoadPrompt } from "../../prompts/loader.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutomaticRepairHandler } from "./automatic-repair-job.js";
import type { JobExecutionContext } from "../job-context.js";

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

function createMockContext(store: GenerationStore, generationId: string): JobExecutionContext {
  return {
    jobId: "11111111-1111-4111-8111-111111111111",
    generationId,
    ownerId: "22222222-2222-4222-8222-222222222222",
    workerId: "worker-test",
    attemptNumber: 1,
    progress: {
      report: vi.fn().mockResolvedValue(undefined),
    },
    store,
    repository: {} as JobExecutionContext["repository"],
    isCancelled: async () => false,
    ownsLock: async () => true,
    assertCanMutate: async () => undefined,
  };
}

describe("createAutomaticRepairHandler", () => {
  it("moves a validated generation from Compiling to Ready after browser sandbox validation", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reactify-repair-job-"));
    const imageStorage = new ImageStorage(storageDir);
    const imageId = await createTestImage(storageDir);
    const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, testEnv.MAX_REPAIR_ATTEMPTS);
    const registry = createDefaultRegistry(createStageExecutors(imageStorage));
    const runner = new PipelineRunner(
      registry,
      store,
      imageStorage,
      DEFAULT_FEATURE_FLAGS,
      createRunnerServices(),
    );
    const handler = createAutomaticRepairHandler(runner);

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

    const submitResult = await runner.submitSandboxValidation(
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash }),
    );
    expect(submitResult.ok).toBe(true);
    expect(submitResult.shouldResume).toBe(true);
    expect(store.get(generationId)?.status).toBe("Compiling");

    await handler({ generationId }, createMockContext(store, generationId));

    const record = store.get(generationId);
    expect(record?.status).toBe("Ready");
    expect(record?.awaitingSandboxValidation).toBe(false);
    expect(record?.sandboxValidation?.compilation.success).toBe(true);
    expect(record?.sandboxValidation?.runtime.success).toBe(true);
    expect(record?.stages.some((stage) => stage.stage === "preview_ready" && stage.status === "completed")).toBe(true);
  });

  it("moves a repaired generation from Repairing to Ready after successful revalidation", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reactify-repair-revalidation-"));
    const imageStorage = new ImageStorage(storageDir);
    const imageId = await createTestImage(storageDir);
    const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, testEnv.MAX_REPAIR_ATTEMPTS);
    const registry = createDefaultRegistry(createStageExecutors(imageStorage));
    const runner = new PipelineRunner(
      registry,
      store,
      imageStorage,
      DEFAULT_FEATURE_FLAGS,
      createRunnerServices(),
    );
    const handler = createAutomaticRepairHandler(runner);

    const generationId = store.create({ imageId }).id;
    await runner.run(generationId);
    expect(runner.confirmPlan(generationId, generationPlanFixture, false).ok).toBe(true);
    await runner.resume(generationId);

    await waitForAwaitingSandboxValidation(async () => {
      const record = store.get(generationId);
      return {
        awaitingSandboxValidation: record?.awaitingSandboxValidation,
        projectHash: record?.projectHash,
      };
    });

    const repairedHash = "97a1ab6f294d88fa5297ad36b0221267c46bcd01151d372e485e335ab0e9dac2";
    const record = store.get(generationId)!;
    record.status = "Repairing";
    record.currentRepairAttempt = 1;
    record.awaitingSandboxValidation = true;
    record.projectHash = repairedHash;
    record.repairStatus = "waiting_for_revalidation";
    record.validationReportFingerprint = null;
    record.pipelineState = {
      ...(record.pipelineState ?? { imageId }),
      projectHash: repairedHash,
      repairRequired: true,
      awaitingSandboxValidation: true,
      generatedProject: record.outputs.generatedProject ?? undefined,
    };

    await runner.submitSandboxValidation(
      generationId,
      createSuccessfulSandboxValidationReport({ generationId, projectHash: repairedHash }),
    );

    expect(store.get(generationId)?.status).toBe("Repairing");
    expect(store.get(generationId)?.repairStatus).toBe("succeeded");

    await handler({ generationId }, createMockContext(store, generationId));

    const finished = store.get(generationId);
    expect(finished?.status).toBe("Ready");
    expect(finished?.sandboxValidation?.projectHash).toBe(repairedHash);
    expect(finished?.stages.some((stage) => stage.stage === "preview_ready" && stage.status === "completed")).toBe(true);
  });
});
