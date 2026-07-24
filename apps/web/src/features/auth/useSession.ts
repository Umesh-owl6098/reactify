import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorCode } from "@reactify/shared";
import { fetchSession, signOutAccount } from "./authApi";
import { useAuthStore } from "./authStore";

export function useSession() {
  const user = useAuthStore((state) => state.user);
  const sessionExpiresAt = useAuthStore((state) => state.sessionExpiresAt);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);
  const setUser = useAuthStore((state) => state.setUser);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const setLoading = useAuthStore((state) => state.setLoading);
  const clear = useAuthStore((state) => state.clear);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    try {
      const session = await fetchSession();
      if (session.authenticated && session.user) {
        setUser(session.user, session.sessionExpiresAt ?? null);
      } else {
        clear();
      }
    } catch {
      clear();
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [clear, setInitialized, setLoading, setUser]);

  useEffect(() => {
    if (!isInitialized) {
      void restoreSession();
    }
  }, [isInitialized, restoreSession]);

  return {
    user,
    sessionExpiresAt,
    isAuthenticated: Boolean(user),
    isInitialized,
    isLoading,
    restoreSession,
    clear,
  };
}

export function useSignOut() {
  const navigate = useNavigate();
  const clear = useAuthStore((state) => state.clear);

  return useCallback(async () => {
    try {
      await signOutAccount();
    } finally {
      clear();
      navigate("/sign-in", { replace: true });
    }
  }, [clear, navigate]);
}

export function handleAuthApiError(error: unknown, clear: () => void): boolean {
  if (error instanceof Error && "code" in error && (error as { code?: string }).code === ErrorCode.AUTHENTICATION_REQUIRED) {
    clear();
    return true;
  }
  return false;
}
