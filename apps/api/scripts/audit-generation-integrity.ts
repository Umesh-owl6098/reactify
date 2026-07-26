import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";
import { getPrismaClient } from "../src/persistence/client.js";
import { computeProjectHash } from "../src/lib/projectHash.js";
import { GeneratedProjectV1Schema } from "@reactify/generation-contracts";

const generationId = "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

async function main() {
  loadLocalEnv();
  const prisma = getPrismaClient(validateEnv());

  const generation = await prisma.generation.findUnique({
    where: { id: generationId },
    include: {
      versions: { orderBy: { versionNumber: "asc" } },
      repairAttempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  if (!generation) {
    throw new Error("Generation not found");
  }

  const parsedProject = generation.outputsGeneratedProject
    ? GeneratedProjectV1Schema.safeParse(generation.outputsGeneratedProject)
    : null;
  const outputsHash = parsedProject?.success ? computeProjectHash(parsedProject.data) : null;

  const pipelineState = generation.pipelineState as { generatedProject?: unknown; projectHash?: string } | null;
  const pipelineProject = pipelineState?.generatedProject
    ? GeneratedProjectV1Schema.safeParse(pipelineState.generatedProject)
    : null;
  const pipelineHash = pipelineProject?.success ? computeProjectHash(pipelineProject.data) : null;

  const activeVersion = generation.versions.find((v) => v.versionId === generation.activeVersionId);
  const activeVersionProject = activeVersion?.projectSnapshot
    ? GeneratedProjectV1Schema.safeParse(activeVersion.projectSnapshot)
    : null;
  const activeVersionHash = activeVersionProject?.success ? computeProjectHash(activeVersionProject.data) : null;

  console.log(
    JSON.stringify(
      {
        generationId,
        status: generation.status,
        currentStage: generation.currentStage,
        activeVersionId: generation.activeVersionId,
        activeVersionNumber: generation.activeVersionNumber,
        latestProjectHash: generation.latestProjectHash,
        outputsHash,
        activeVersionHash,
        activeVersionStoredHash: activeVersion?.projectHash ?? null,
        pipelineHash,
        pipelineStateProjectHash: pipelineState?.projectHash ?? null,
        sandboxValidationHash: (generation.sandboxValidation as { projectHash?: string } | null)?.projectHash ?? null,
        outputsFileCount: parsedProject?.success ? parsedProject.data.files.length : null,
        activeVersionFileCount: activeVersionProject?.success ? activeVersionProject.data.files.length : null,
        pipelineFileCount: pipelineProject?.success ? pipelineProject.data.files.length : null,
        versions: generation.versions.map((v) => ({
          versionId: v.versionId,
          versionNumber: v.versionNumber,
          source: v.source,
          projectHash: v.projectHash,
          fileCount: GeneratedProjectV1Schema.safeParse(v.projectSnapshot).success
            ? GeneratedProjectV1Schema.parse(v.projectSnapshot).files.length
            : null,
        })),
        repairAttempts: generation.repairAttempts.map((a) => ({
          attemptNumber: a.attemptNumber,
          status: a.status,
          projectHashBefore: a.projectHashBefore,
          projectHashAfter: a.projectHashAfter,
          hasSandboxValidationAfter: Boolean(a.sandboxValidationAfter),
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
