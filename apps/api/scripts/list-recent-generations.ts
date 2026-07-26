import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "../src/lib/load-local-env.js";

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const rows = await prisma.generation.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      createdAt: true,
      awaitingSandboxValidation: true,
      latestProjectHash: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
