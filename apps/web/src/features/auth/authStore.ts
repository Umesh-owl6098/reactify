import { create } from "zustand";
import type { AuthenticatedUser } from "@reactify/shared";
import type { SessionStatus } from "./session-status.js";

interface AuthState {
  user: AuthenticatedUser | null;
  sessionExpiresAt: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  sessionStatus: SessionStatus;
  sessionError: string | null;
  setUser: (user: AuthenticatedUser | null, sessionExpiresAt?: string | null) => void;
  setInitialized: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setSessionStatus: (status: SessionStatus) => void;
  setSessionError: (message: string | null) => void;
  establishSession: (user: AuthenticatedUser, sessionExpiresAt?: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionExpiresAt: null,
  isInitialized: false,
  isLoading: false,
  sessionStatus: "unknown",
  sessionError: null,
  setUser: (user, sessionExpiresAt = null) =>
    set({
      user,
      sessionExpiresAt,
      sessionStatus: user ? "authenticated" : "unauthenticated",
      sessionError: null,
    }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  setLoading: (isLoading) =>
    set((state) => ({
      isLoading,
      sessionStatus: isLoading ? "loading" : state.sessionStatus,
    })),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  setSessionError: (sessionError) => set({ sessionError }),
  establishSession: (user, sessionExpiresAt = null) =>
    set({
      user,
      sessionExpiresAt,
      isInitialized: true,
      isLoading: false,
      sessionStatus: "authenticated",
      sessionError: null,
    }),
  clear: () =>
    set({
      user: null,
      sessionExpiresAt: null,
      sessionStatus: "unauthenticated",
      sessionError: null,
    }),
}));
