import { create } from "zustand";
import type { JobStatusResponse } from "@reactify/shared";

interface JobStoreState {
  activeJobId: string | null;
  jobs: Record<string, JobStatusResponse>;
  setActiveJobId: (jobId: string | null) => void;
  upsertJob: (job: JobStatusResponse) => void;
  clearJob: (jobId: string) => void;
  reset: () => void;
}

export const useJobStore = create<JobStoreState>((set) => ({
  activeJobId: null,
  jobs: {},
  setActiveJobId: (jobId) => set({ activeJobId: jobId }),
  upsertJob: (job) =>
    set((state) => ({
      jobs: {
        ...state.jobs,
        [job.jobId]: job,
      },
    })),
  clearJob: (jobId) =>
    set((state) => {
      const nextJobs = { ...state.jobs };
      delete nextJobs[jobId];
      return {
        jobs: nextJobs,
        activeJobId: state.activeJobId === jobId ? null : state.activeJobId,
      };
    }),
  reset: () => set({ activeJobId: null, jobs: {} }),
}));
