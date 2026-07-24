import type { UsageRepository } from "./usage-repository.js";

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

export async function recoverExpiredReservations(repository: UsageRepository): Promise<number> {
  try {
    const expired = await repository.findExpiredActiveReservations();
    let recovered = 0;

    for (const reservation of expired) {
      if (!reservation.jobId) {
        await repository.releaseReservation(reservation.id, "expired");
        recovered += 1;
        continue;
      }

      const usage = await repository.prisma.aiUsageRecord.findFirst({
        where: {
          jobId: reservation.jobId,
          attemptNumber: reservation.attemptNumber,
          status: { in: ["reconciled", "completed"] },
        },
      });

      if (usage) {
        await repository.prisma.usageReservation.update({
          where: { id: reservation.id },
          data: { status: "reconciled", reconciledAt: new Date() },
        });
        recovered += 1;
        continue;
      }

      const job = await repository.prisma.backgroundJob.findUnique({
        where: { id: reservation.jobId },
        select: { status: true },
      });

      if (job && ["completed", "failed", "cancelled", "dead_letter"].includes(job.status)) {
        await repository.releaseReservation(reservation.id, "expired");
        recovered += 1;
      }
    }

    return recovered;
  } catch (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    throw error;
  }
}

export async function safeRecoverExpiredReservations(
  repository: UsageRepository,
  log?: (message: string, fields?: Record<string, unknown>) => void,
): Promise<void> {
  try {
    const recovered = await recoverExpiredReservations(repository);
    if (recovered > 0) {
      log?.("usage_reservation_recovery_completed", { recovered });
    }
  } catch (error) {
    log?.("usage_reservation_recovery_failed", {
      message: error instanceof Error ? error.message : "Unknown recovery error",
    });
  }
}
