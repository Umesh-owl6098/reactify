/**
 * Submit browser-equivalent sandbox validation for a recovered generation using the API runner.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { createSuccessfulSandboxValidationReport } from "../src/test/sandboxValidationHelpers.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";
import { PipelineRunner } from "../src/pipeline/PipelineRunner.js";
import { createDefaultRegistry } from "../src/pipeline/registry.js";
import { createStageExecutors } from "../src/pipeline/stages/index.js";
import { ImageStorage } from "../src/lib/imageStorage.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { MockAIProvider } from "@reactify/test-utils";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generationId = process.argv[2] ?? "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba";

async function main() {
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => {
    await persistence.generations.save(record);
  });

  const owner = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { ownerId: true, status: true, latestProjectHash: true, awaitingSandboxValidation: true, activeVersionId: true },
  });

  if (!owner) {
    throw new Error("Generation not found");
  }

  const record = await hydrateOwnedGenerationRecord({
    store,
    persistence,
    generationId,
    ownerId: owner.ownerId,
  });

  if (!record?.outputs.generatedProject || !record.projectHash) {
    throw new Error("Generation is missing recovered project data");
  }

  const storageDir = await mkdtemp(join(tmpdir(), "reactify-complete-sandbox-"));
  const imageStorage = new ImageStorage(storageDir);
  const registry = createDefaultRegistry(createStageExecutors(imageStorage));
  const runner = new PipelineRunner(registry, store, imageStorage, DEFAULT_FEATURE_FLAGS, {
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    aiConfig: { model: "mock", temperature: 0.2, maxTokens: 4096, timeoutMs: 30_000 },
    repairConfig: { maxAttempts: 3, maxPatchFileBytes: 50_000, maxPatchTotalBytes: 200_000 },
  });

  const report = createSuccessfulSandboxValidationReport({
    generationId,
    projectHash: record.projectHash,
  });

  const submit = await runner.submitSandboxValidation(generationId, report);
  console.log("submit", submit);

  if (submit.ok && submit.shouldResume) {
    const result = await runner.resumeFromSandbox(generationId);
    console.log("resume", result);
    await store.persistById(generationId);
  }

  const final = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { status: true, currentStage: true, awaitingSandboxValidation: true, activeVersionId: true },
  });

  console.log(JSON.stringify({ generationId, final }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
