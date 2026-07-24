import { create } from "zustand";
import type { UsageAccountResponse, UsageOperationListResponse } from "@reactify/shared";
import { fetchAccountUsage, fetchUsageOperations } from "./usage-api";

interface UsageStoreState {
  accountUsage: UsageAccountResponse | null;
  operations: UsageOperationListResponse | null;
  loading: boolean;
  error: string | null;
  loadAccountUsage: () => Promise<void>;
  loadOperations: () => Promise<void>;
}

export const useUsageStore = create<UsageStoreState>((set) => ({
  accountUsage: null,
  operations: null,
  loading: false,
  error: null,
  loadAccountUsage: async () => {
    set({ loading: true, error: null });
    try {
      const accountUsage = await fetchAccountUsage();
      set({ accountUsage, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load usage",
      });
    }
  },
  loadOperations: async () => {
    set({ loading: true, error: null });
    try {
      const operations = await fetchUsageOperations({ limit: 20, offset: 0 });
      set({ operations, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load operations",
      });
    }
  },
}));
