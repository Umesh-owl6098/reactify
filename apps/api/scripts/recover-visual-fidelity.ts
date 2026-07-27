/**
 * Drives the normal visual-correction state machine for one generation.
 *
 * Nothing here writes status or hashes directly: it calls the same
 * VisualComparisonService the API route uses, then lets the sandbox-validation
 * path finish the version the way a browser session would.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { validateEnv } from "../src/env.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { VisualComparisonService } from "../src/lib/visual-comparison/VisualComparisonService.js";
import { createScriptStores } from "./lib/script-storage.js";
import { validateVisualFidelity } from "../src/lib/visual-fidelity/visualFidelityValidator.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { createAIProvider } from "../src/providers/providerFactory.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const comparisonId = process.argv[3];

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const { ownerId } = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true },
  });

  const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
  if (!record?.projectHash) {
    throw new Error("Generation has no active project version");
  }

  reconcileGenerationLocksSync(record, { editLockTimeoutMs: 0, visualCaptureTimeoutMs: 0, exportLockTimeoutMs: 0 });
  await store.persist(record);

  const { imageStorage, comparisonArtifactStore } = createScriptStores(env);
  const service = VisualComparisonService.fromDeps({
    aiProvider: createAIProvider(env),
    loadPrompt: defaultLoadPrompt,
    env,
    imageStorage,
    artifactStore: comparisonArtifactStore,
  });

  const target =
    comparisonId ??
    [...record.visualComparisons]
      .reverse()
      .find((entry) => entry.status === "correction_available")?.comparisonId;

  if (!target) {
    throw new Error("No comparison is in correction_available state");
  }

  const before = record.projectHash;
  const result = await service.applyCorrection(record, target, { expectedProjectHash: record.projectHash! });
  await store.persist(record);

  const composition = record.outputs.designAnalysis?.visualComposition;
  const fidelity =
    composition && record.outputs.generatedProject
      ? validateVisualFidelity(composition, record.outputs.generatedProject)
      : null;

  console.log(
    JSON.stringify(
      {
        generationId,
        comparisonId: target,
        applied: result.ok,
        message: result.ok ? null : result.message,
        errorCode: result.ok ? null : result.errorCode,
        previousProjectHash: before,
        projectHash: record.projectHash,
        activeVersionId: record.activeVersionId,
        status: record.status,
        awaitingSandboxValidation: record.awaitingSandboxValidation,
        visualCorrectionAttempt: record.visualCorrectionAttempt,
        visualCorrectionMaxAttempts: record.visualCorrectionMaxAttempts,
        fidelity,
        runId: randomUUID(),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
