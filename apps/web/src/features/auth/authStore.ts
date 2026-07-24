import { create } from "zustand";
import type { AuthenticatedUser } from "@reactify/shared";

interface AuthState {
  user: AuthenticatedUser | null;
  sessionExpiresAt: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  setUser: (user: AuthenticatedUser | null, sessionExpiresAt?: string | null) => void;
  setInitialized: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionExpiresAt: null,
  isInitialized: false,
  isLoading: false,
  setUser: (user, sessionExpiresAt = null) => set({ user, sessionExpiresAt }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ user: null, sessionExpiresAt: null }),
}));
