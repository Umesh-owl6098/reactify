import { getPrismaClient } from "../src/persistence/client.js";
import { validateEnv } from "../src/env.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";

async function main() {
  loadLocalEnv();
  const prisma = getPrismaClient(validateEnv());
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: query-generation.ts <generationId>");
    process.exit(1);
  }

  const generation = await prisma.generation.findUnique({ where: { id } });
  const jobs = await prisma.backgroundJob.findMany({
    where: { generationId: id },
    orderBy: { createdAt: "asc" },
  });

  console.info(JSON.stringify({ generation, jobs }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
