import { useCallback, useEffect, useMemo, useState } from "react";
import type { GenerationPlanV1 } from "@reactify/generation-contracts";
import { validateGenerationPlan } from "./planValidation";

function clonePlan(plan: GenerationPlanV1): GenerationPlanV1 {
  return structuredClone(plan);
}

export function usePlanEditor(originalPlan: GenerationPlanV1 | null, editingEnabled: boolean) {
  const [draftPlan, setDraftPlan] = useState<GenerationPlanV1 | null>(
    originalPlan ? clonePlan(originalPlan) : null,
  );

  useEffect(() => {
    setDraftPlan(originalPlan ? clonePlan(originalPlan) : null);
  }, [originalPlan]);

  const validation = useMemo(
    () => (draftPlan ? validateGenerationPlan(draftPlan) : { success: false, fieldErrors: {} }),
    [draftPlan],
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!originalPlan || !draftPlan) {
      return false;
    }

    return JSON.stringify(originalPlan) !== JSON.stringify(draftPlan);
  }, [draftPlan, originalPlan]);

  const updateDraft = useCallback(
    (updater: (plan: GenerationPlanV1) => GenerationPlanV1) => {
      if (!editingEnabled || !draftPlan) {
        return;
      }

      setDraftPlan((current) => (current ? updater(clonePlan(current)) : current));
    },
    [draftPlan, editingEnabled],
  );

  const resetDraft = useCallback(() => {
    if (!originalPlan) {
      return;
    }

    setDraftPlan(clonePlan(originalPlan));
  }, [originalPlan]);

  return {
    draftPlan,
    validation,
    hasUnsavedChanges,
    updateDraft,
    resetDraft,
  };
}
