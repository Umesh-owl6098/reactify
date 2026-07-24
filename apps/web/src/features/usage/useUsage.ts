import { useEffect } from "react";
import { useUsageStore } from "./usageStore";

export function useUsage() {
  const accountUsage = useUsageStore((state) => state.accountUsage);
  const operations = useUsageStore((state) => state.operations);
  const loading = useUsageStore((state) => state.loading);
  const error = useUsageStore((state) => state.error);
  const loadAccountUsage = useUsageStore((state) => state.loadAccountUsage);
  const loadOperations = useUsageStore((state) => state.loadOperations);

  useEffect(() => {
    void loadAccountUsage();
    void loadOperations();
  }, [loadAccountUsage, loadOperations]);

  return { accountUsage, operations, loading, error, reload: loadAccountUsage };
}
