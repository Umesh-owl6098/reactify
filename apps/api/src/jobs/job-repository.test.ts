import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createJobConfig } from "./job-config.js";
import { JobRepository } from "./job-repository.js";
import { testEnv } from "../test/helpers.js";
import { resetWorkerIdForTests, getWorkerId } from "./worker-id.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? testEnv.DATABASE_URL;

describe("JobRepository", () => {
  let prisma: PrismaClient;
  let repository: JobRepository;
  let generationId: string;
  let ownerId: string;

  beforeEach(async () => {
    resetWorkerIdForTests();
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    repository = new JobRepository(prisma, createJobConfig(testEnv));
    generationId = randomUUID();
    ownerId = randomUUID();

    await prisma.user.create({
      data: {
        id: ownerId,
        email: `jobs-${ownerId}@example.com`,
        normalizedEmail: `jobs-${ownerId}@example.com`,
        passwordHash: "hash",
        displayName: "Job Test User",
      },
    });

    const imageId = randomUUID();
    await prisma.uploadedImage.create({
      data: {
        id: imageId,
        ownerId,
        storageKey: `test/${imageId}.png`,
        mimeType: "image/png",
        sizeBytes: 100,
      },
    });

    await prisma.generation.create({
      data: {
        id: generationId,
        ownerId,
        projectId: randomUUID(),
        sourceImageId: imageId,
        status: "Queued",
      },
    });
  });

  afterEach(async () => {
    await prisma.backgroundJob.deleteMany({ where: { generationId } });
    await prisma.generation.deleteMany({ where: { id: generationId } });
    await prisma.uploadedImage.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("enqueues and idempotently returns the same job", async () => {
    const first = await repository.enqueue({
      generationId,
      ownerId,
      jobType: "design_analysis",
      payload: { generationId, imageId: randomUUID() },
      idempotencyKey: "design-start",
    });

    const second = await repository.enqueue({
      generationId,
      ownerId,
      jobType: "design_analysis",
      payload: { generationId, imageId: randomUUID() },
      idempotencyKey: "design-start",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.job.id).toBe(second.job.id);
  });

  it("claims only one eligible job per worker", async () => {
    await repository.enqueue({
      generationId,
      ownerId,
      jobType: "design_analysis",
      payload: { generationId, imageId: randomUUID() },
      idempotencyKey: "claim-a",
    });

    const workerA = getWorkerId();
    resetWorkerIdForTests();
    const workerB = getWorkerId();

    const claimedA = await repository.claimNextJob(workerA);
    const claimedB = await repository.claimNextJob(workerB);

    expect(claimedA).not.toBeNull();
    expect(claimedB).toBeNull();
  });
});
