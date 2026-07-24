import type { PrismaClient } from "@prisma/client";
import { ErrorCode } from "@reactify/shared";
import type { GenerationRecord } from "../../pipeline/types.js";
import { GenerationRepository } from "../repositories/GenerationRepository.js";

const INTERRUPTED_STATUSES = new Set([
  "analyzing",
  "generating_patch",
  "validating_patch",
  "applying_patch",
  "processing",
  "preparing",
]);

export async function recoverGenerationsAfterRestart(
  repository: GenerationRepository,
  prisma: PrismaClient,
): Promise<number> {
  const records = await repository.findAllActive();
  let recovered = 0;

  for (const record of records) {
    let changed = false;
    const next: GenerationRecord = structuredClone(record);

    if (next.repairInProgress) {
      next.repairInProgress = false;
      next.repairStatus = next.repairStatus === "waiting_for_revalidation" ? "waiting_for_revalidation" : "failed";
      changed = true;
    }

    if (next.editInProgress) {
      next.editInProgress = false;
      const activeEdit = next.edits.find((edit) => edit.editId === next.activeEditId);
      if (activeEdit && !["completed", "failed", "cancelled", "awaiting_confirmation"].includes(activeEdit.status)) {
        activeEdit.status = "failed";
        activeEdit.failureReason = "Edit interrupted by server restart.";
        activeEdit.completedAt = new Date().toISOString();
      }
      next.activeEditId = null;
      changed = true;
    }

    if (next.visualComparisonInProgress || next.visualCorrectionInProgress) {
      next.visualComparisonInProgress = false;
      next.visualCorrectionInProgress = false;
      const activeComparison = next.visualComparisons.find((entry) => entry.comparisonId === next.activeComparisonId);
      if (activeComparison && INTERRUPTED_STATUSES.has(activeComparison.status)) {
        activeComparison.status = "failed";
        activeComparison.failureReason = "Visual comparison interrupted by server restart.";
        activeComparison.completedAt = new Date().toISOString();
      }
      next.activeComparisonId = null;
      changed = true;
    }

    if (next.exportInProgress) {
      next.exportInProgress = false;
      const preparing = next.exports.find((entry) => entry.status === "preparing");
      if (preparing) {
        preparing.status = "failed";
        preparing.failureReason = "Export interrupted by server restart.";
        preparing.completedAt = new Date().toISOString();
      }
      changed = true;
    }

    for (const edit of next.edits) {
      if (["analyzing", "generating_patch", "validating_patch", "applying_patch"].includes(edit.status)) {
        edit.status = "failed";
        edit.failureReason = "Edit interrupted by server restart.";
        edit.completedAt = new Date().toISOString();
        changed = true;
      }
    }

    if (next.resumeInProgress || next.sandboxResumeInProgress) {
      next.resumeInProgress = false;
      next.sandboxResumeInProgress = false;
      changed = true;
    }

    if (changed) {
      next.errors.push({
        stage: next.activeStage ?? "preview_ready",
        code: ErrorCode.SERVER_RESTARTED,
        message: "Operation state was recovered after server restart.",
      });
      await repository.save(next);
      recovered += 1;
    }
  }

  await prisma.projectExport.updateMany({
    where: { status: "preparing" },
    data: {
      status: "failed",
      failureReason: "Export interrupted by server restart.",
      completedAt: new Date(),
    },
  });

  return recovered;
}
