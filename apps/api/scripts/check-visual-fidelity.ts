/** Report structural fidelity of the active project against the stored composition. */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateVisualFidelity } from "../src/lib/visual-fidelity/visualFidelityValidator.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);

  const { ownerId } = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true },
  });
  const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
  if (!record) {
    throw new Error("Generation not found");
  }

  const composition = record.outputs.designAnalysis?.visualComposition;
  const project = record.outputs.generatedProject;
  const report = composition && project ? validateVisualFidelity(composition, project) : null;

  console.log(
    JSON.stringify(
      {
        generationId,
        status: record.status,
        projectHash: record.projectHash,
        awaitingSandboxValidation: record.awaitingSandboxValidation,
        visualCorrectionAttempt: record.visualCorrectionAttempt,
        comparisons: record.visualComparisons.map((entry) => ({
          comparisonId: entry.comparisonId,
          status: entry.status,
          similarity: entry.overallSimilarityScore,
        })),
        hasComposition: Boolean(composition),
        report,
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
