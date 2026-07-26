import { getPrismaClient } from "../src/persistence/client.js";
import { validateEnv } from "../src/env.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";

async function main() {
  loadLocalEnv();
  const prisma = getPrismaClient(validateEnv());

  const planning = await prisma.generation.findMany({
    where: { status: "Planning" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      failureCode: true,
      createdAt: true,
    },
  });

  const jobs = await prisma.backgroundJob.findMany({
    where: { status: "waiting_for_client" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, generationId: true, jobType: true, status: true },
  });

  console.info(JSON.stringify({ planning, waitingJobs: jobs }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
