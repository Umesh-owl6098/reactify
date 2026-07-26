import { PrismaClient } from "@prisma/client";

/**
 * Answers one question: does any edit row referencing the "dashboard title"
 * instruction actually belong to the DeviceFramesShowcase generation, or is the
 * leak purely client side?
 */
const prisma = new PrismaClient();

const TARGET = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";

async function main() {
  const editsForTarget = await prisma.projectEdit.findMany({
    where: { generationId: TARGET },
    select: {
      editId: true,
      generationId: true,
      instruction: true,
      status: true,
      createdAt: true,
      completedAt: true,
      createdVersionId: true,
      versionNumber: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const dashboardEdits = await prisma.projectEdit.findMany({
    where: { instruction: { contains: "dashboard title", mode: "insensitive" } },
    select: { editId: true, generationId: true, instruction: true, status: true },
  });

  const generation = await prisma.generation.findUnique({
    where: { id: TARGET },
    select: { id: true, status: true, ownerId: true, editInProgress: true, activeEditId: true },
  });

  console.log(
    JSON.stringify(
      {
        target: TARGET,
        generation,
        editsAttachedToTarget: editsForTarget,
        anyDashboardTitleEditsInDb: dashboardEdits,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
