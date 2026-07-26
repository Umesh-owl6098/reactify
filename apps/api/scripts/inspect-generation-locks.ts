/** Inspect edit and visual-comparison state for a generation. */
import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "../src/lib/load-local-env.js";

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();

  const generation = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    include: {
      edits: { orderBy: { createdAt: "asc" } },
      visualComparisons: { orderBy: { createdAt: "asc" } },
      versions: { orderBy: { versionNumber: "asc" } },
      backgroundJobs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  const activeVersion = generation.versions.find((v) => v.versionId === generation.activeVersionId);

  console.log(
    JSON.stringify(
      {
        generation: {
          status: generation.status,
          editInProgress: generation.editInProgress,
          activeEditId: generation.activeEditId,
          visualComparisonInProgress: generation.visualComparisonInProgress,
          activeComparisonId: generation.activeComparisonId,
          previewCaptureRequired: generation.previewCaptureRequired,
          latestProjectHash: generation.latestProjectHash,
          activeVersionId: generation.activeVersionId,
          activeVersionNumber: activeVersion?.versionNumber ?? null,
        },
        edits: generation.edits.map((edit) => ({
          editId: edit.editId,
          status: edit.status,
          instruction: edit.instruction,
          sourceVersionId: edit.sourceVersionId,
          createdVersionId: edit.createdVersionId,
          projectHashBefore: edit.projectHashBefore,
          projectHashAfter: edit.projectHashAfter,
          createdAt: edit.createdAt,
          updatedAt: edit.updatedAt,
          completedAt: edit.completedAt,
          failureReason: edit.failureReason,
        })),
        visualComparisons: generation.visualComparisons.map((comparison) => ({
          comparisonId: comparison.comparisonId,
          status: comparison.status,
          viewport: comparison.viewport,
          similarityScore: comparison.similarityScore,
          pixelDifferencePercentage: comparison.pixelDifferencePercentage,
          createdAt: comparison.createdAt,
          completedAt: comparison.completedAt,
          failureReason: comparison.failureReason,
        })),
        recentJobs: generation.backgroundJobs.map((job) => ({
          jobId: job.id,
          jobType: job.jobType,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          lastHeartbeatAt: job.lastHeartbeatAt,
          failureCode: job.failureCode,
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
