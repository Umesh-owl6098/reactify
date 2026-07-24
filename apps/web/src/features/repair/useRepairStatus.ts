import { useCallback, useEffect, useState } from "react";
import type {
  GenerationStatusResponse,
  RepairAttemptDetailResponse,
} from "@reactify/generation-contracts";
import { fetchRepairAttempt, retryRepair } from "../../lib/generation-api";

export function useRepairStatus(status: GenerationStatusResponse | null, onRetryComplete: () => void) {
  const [attemptDetail, setAttemptDetail] = useState<RepairAttemptDetailResponse | null>(null);

  useEffect(() => {
    if (!status?.repair || status.repair.currentAttempt === 0) {
      setAttemptDetail(null);
      return;
    }

    let cancelled = false;
    void fetchRepairAttempt(status.id, status.repair.currentAttempt)
      .then((detail) => {
        if (!cancelled) {
          setAttemptDetail(detail);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAttemptDetail(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status?.id, status?.repair?.currentAttempt, status?.repair]);

  const manualRetry = useCallback(async () => {
    if (!status) {
      return;
    }
    await retryRepair(status.id);
    onRetryComplete();
  }, [onRetryComplete, status]);

  return {
    repair: status?.repair ?? null,
    attemptDetail,
    manualRetry,
  };
}
