import { getPrismaClient } from "../src/persistence/client.js";
import { validateEnv } from "../src/env.js";

async function main() {
  const env = validateEnv({ ...process.env, DATABASE_URL: process.env.DATABASE_URL! });
  const prisma = getPrismaClient(env);

  const jobs = await prisma.backgroundJob.findMany({
    where: { jobType: "design_analysis", status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      generation: {
        select: {
          id: true,
          status: true,
          failureCode: true,
          failureMessage: true,
          createdAt: true,
        },
      },
    },
  });

  console.info(JSON.stringify(jobs, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
