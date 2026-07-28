import { PrismaClient } from "@prisma/client";
import { GenerationRepository } from "../src/persistence/repositories/GenerationRepository.js";
import { computeProjectHash } from "../src/lib/projectHash.js";
import { getActiveVersion } from "../src/lib/edit/versionStore.js";

const generationId = process.argv[2];
if (!generationId) {
  console.error("usage: tsx scripts/diagnose-ready-eligibility.ts <generationId>");
  process.exit(1);
}

const prisma = new PrismaClient();
const repository = new GenerationRepository(prisma);

const record = await repository.findById(generationId);
if (!record) {
  console.error("generation not found");
  process.exit(1);
}

const active = getActiveVersion(record);
const summary = {
  status: record.status,
  activeVersionId: record.activeVersionId,
  projectHash: record.projectHash,
  awaitingSandboxValidation: record.awaitingSandboxValidation,
  hasOutputsProject: Boolean(record.outputs.generatedProject),
  outputsHash: record.outputs.generatedProject ? computeProjectHash(record.outputs.generatedProject) : null,
  activeVersion: active
    ? {
        versionNumber: active.versionNumber,
        storedHash: active.projectHash,
        snapshotHash: computeProjectHash(active.project),
      }
    : null,
  schemaValidationValid: record.schemaValidation?.valid ?? null,
  staticValidationValid: record.staticValidation?.valid ?? null,
  sandbox: record.sandboxValidation
    ? {
        compilation: record.sandboxValidation.compilation.success,
        runtime: record.sandboxValidation.runtime.success,
        projectHash: record.sandboxValidation.projectHash,
      }
    : null,
  lastErrors: record.errors.slice(-3),
};
console.log(JSON.stringify(summary, null, 2));
await prisma.$disconnect();
