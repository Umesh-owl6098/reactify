/**
 * Re-runs the design analysis stage for an existing generation.
 *
 * Generations analysed before the visualComposition format carry no geometry,
 * so structural fidelity checks and corrections have nothing to work against.
 * This replays the real stage executor over the same stored source image and
 * persists whatever the provider returns. It writes only the analysis output;
 * status, hashes, and versions are left to the normal state machine.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { validateEnv } from "../src/env.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { createScriptStores } from "./lib/script-storage.js";
import { designAnalysisStage } from "../src/pipeline/stages/designAnalysis.js";
import type { PipelineState } from "../src/pipeline/types.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { createAIProvider } from "../src/providers/providerFactory.js";
import { resolveActiveModel } from "../src/providers/ai-provider-config.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";

const logger = {
  info: (event: string, fields?: Record<string, unknown>) => console.log(event, fields ?? ""),
  warn: (event: string, fields?: Record<string, unknown>) => console.warn(event, fields ?? ""),
  error: (event: string, fields?: Record<string, unknown>) => console.error(event, fields ?? ""),
  debug: () => undefined,
};

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
  if (!record) {
    throw new Error("Generation not found");
  }

  const { imageStorage } = createScriptStores(env);
  const sourceImage = await imageStorage.get(record.imageId);
  if (!sourceImage) {
    throw new Error("Source image is no longer available");
  }

  const state: PipelineState = {
    imageId: record.imageId,
    imageMimeType: sourceImage.mimeType,
    imageInput: {
      base64: sourceImage.buffer.toString("base64"),
      mimeType: sourceImage.mimeType,
    },
  } as PipelineState;

  const result = await designAnalysisStage(state, {
    generationId,
    projectId: generationId,
    imageId: record.imageId,
    logger: logger as never,
    flags: DEFAULT_FEATURE_FLAGS,
    aiProvider: createAIProvider(env),
    loadPrompt: defaultLoadPrompt,
    aiConfig: {
      model: resolveActiveModel(env),
      temperature: env.AI_TEMPERATURE,
      maxTokens: env.AI_MAX_TOKENS,
      timeoutMs: env.AI_TIMEOUT_MS,
    },
    repairConfig: {
      maxAttempts: env.MAX_REPAIR_ATTEMPTS,
      maxPatchFileBytes: env.MAX_PATCH_FILE_BYTES,
      maxPatchTotalBytes: env.MAX_PATCH_TOTAL_BYTES,
    },
  });

  if (result.status !== "completed") {
    throw new Error(`Design analysis failed: ${result.errorCode} ${result.errorMessage}`);
  }

  const output = result.output as Partial<PipelineState>;
  record.outputs.designAnalysis = output.designAnalysis;
  record.outputs.analysisMetadata = output.analysisMetadata;
  record.updatedAt = new Date().toISOString();
  await store.persist(record);

  const composition = output.designAnalysis?.visualComposition;
  console.log(
    JSON.stringify(
      {
        generationId,
        hasComposition: Boolean(composition),
        sourceWidth: composition?.sourceWidth,
        sourceHeight: composition?.sourceHeight,
        backgroundColor: composition?.backgroundColor,
        objectCount: composition?.objects.length ?? 0,
        majorObjectIds: composition?.majorObjectIds ?? [],
        objects: composition?.objects.map((object) => ({
          id: object.id,
          name: object.name,
          kind: object.kind,
          box: object.box,
        })),
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
