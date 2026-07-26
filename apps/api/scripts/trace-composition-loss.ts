/** Narrow down which persistence step drops visualComposition. */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { DesignAnalysisV1Schema } from "@reactify/generation-contracts";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";

async function readRaw(prisma: PrismaClient): Promise<boolean> {
  const row = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { outputsDesignAnalysis: true },
  });
  const raw = row.outputsDesignAnalysis as Record<string, unknown> | null;
  return Boolean(raw && "visualComposition" in raw && raw.visualComposition);
}

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  console.log("in database before:", await readRaw(prisma));

  const row = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true, outputsDesignAnalysis: true },
  });

  const reparsed = DesignAnalysisV1Schema.safeParse(row.outputsDesignAnalysis);
  console.log("schema reparse ok:", reparsed.success);
  console.log("schema reparse keeps composition:", reparsed.success && Boolean(reparsed.data.visualComposition));
  if (!reparsed.success) {
    console.log("issues:", JSON.stringify(reparsed.error.issues.slice(0, 5), null, 2));
  }

  const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId: row.ownerId });
  console.log("after hydrate, in memory:", Boolean(record?.outputs.designAnalysis?.visualComposition));

  await store.persist(record!);
  console.log("after persist, in database:", await readRaw(prisma));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
