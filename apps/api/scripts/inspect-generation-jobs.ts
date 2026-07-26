import { PrismaClient } from "@prisma/client";

const generationId = process.argv[2] ?? "76825ff8-3eef-4202-9370-e8fd3b290742";

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL ?? "postgresql://reactify:reactify_dev@localhost:5434/reactify" },
  },
});

async function main() {
  const generation = await prisma.generation.findUnique({
    where: { id: generationId },
    include: {
      stages: { orderBy: { startedAt: "asc" } },
      backgroundJobs: { orderBy: { createdAt: "asc" } },
    },
  });

  const jobs = await prisma.backgroundJob.findMany({
    where: { generationId },
    orderBy: { createdAt: "asc" },
  });

  const attempts = jobs.length
    ? await prisma.jobAttempt.findMany({
        where: { jobId: { in: jobs.map((job) => job.id) } },
        orderBy: { startedAt: "asc" },
      })
    : [];

  const reservations =
    jobs.length > 0
      ? await prisma.usageReservation.findMany({
          where: { jobId: { in: jobs.map((job) => job.id) } },
          orderBy: { createdAt: "asc" },
        })
      : [];

  console.log(
    JSON.stringify(
      { generation, jobs, attempts, reservations },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
