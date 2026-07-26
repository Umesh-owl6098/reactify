import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorCode } from "@reactify/shared";
import { AuthApiError, fetchSession, signOutAccount } from "./authApi";
import { useAuthStore } from "./authStore";
import {
  beginSessionRestore,
  invalidateSessionRestore,
  isSessionRestoreCurrent,
  resetInitialSessionRestoreFlag,
  shouldStartInitialSessionRestore,
} from "./session-restore.js";

export function useSession() {
  const user = useAuthStore((state) => state.user);
  const sessionExpiresAt = useAuthStore((state) => state.sessionExpiresAt);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);
  const sessionStatus = useAuthStore((state) => state.sessionStatus);
  const sessionError = useAuthStore((state) => state.sessionError);
  const setUser = useAuthStore((state) => state.setUser);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setSessionStatus = useAuthStore((state) => state.setSessionStatus);
  const setSessionError = useAuthStore((state) => state.setSessionError);
  const establishSession = useAuthStore((state) => state.establishSession);
  const clear = useAuthStore((state) => state.clear);

  const restoreSession = useCallback(async () => {
    const restoreId = beginSessionRestore();
    setLoading(true);
    setSessionStatus("loading");
    setSessionError(null);

    try {
      const session = await fetchSession();
      if (!isSessionRestoreCurrent(restoreId)) {
        return;
      }

      if (session.authenticated && session.user) {
        setUser(session.user, session.sessionExpiresAt ?? null);
        setSessionStatus("authenticated");
        setSessionError(null);
      } else {
        clear();
      }
    } catch (error) {
      if (!isSessionRestoreCurrent(restoreId)) {
        return;
      }

      clear();
      setSessionStatus("error");
      setSessionError(
        error instanceof AuthApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to restore your session.",
      );
    } finally {
      if (isSessionRestoreCurrent(restoreId)) {
        setLoading(false);
        setInitialized(true);
      }
    }
  }, [clear, setInitialized, setLoading, setSessionError, setSessionStatus, setUser]);

  useEffect(() => {
    if (!isInitialized && shouldStartInitialSessionRestore()) {
      void restoreSession();
    }
  }, [isInitialized, restoreSession]);

  const completeSignIn = useCallback(
    (nextUser: NonNullable<typeof user>, nextSessionExpiresAt?: string | null) => {
      invalidateSessionRestore();
      establishSession(nextUser, nextSessionExpiresAt ?? null);
    },
    [establishSession],
  );

  return {
    user,
    sessionExpiresAt,
    isAuthenticated: sessionStatus === "authenticated" && Boolean(user),
    isInitialized,
    isLoading,
    sessionStatus,
    sessionError,
    restoreSession,
    completeSignIn,
    clear,
  };
}

export function useSignOut() {
  const navigate = useNavigate();
  const clear = useAuthStore((state) => state.clear);
  const setSessionStatus = useAuthStore((state) => state.setSessionStatus);

  return useCallback(async () => {
    try {
      await signOutAccount();
    } finally {
      invalidateSessionRestore();
      resetInitialSessionRestoreFlag();
      clear();
      setSessionStatus("unauthenticated");
      useAuthStore.getState().setInitialized(true);
      useAuthStore.getState().setLoading(false);
      navigate("/sign-in", { replace: true });
    }
  }, [clear, navigate, setSessionStatus]);
}

export function handleAuthApiError(error: unknown, clearAuth: () => void): boolean {
  if (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === ErrorCode.AUTHENTICATION_REQUIRED
  ) {
    clearAuth();
    return true;
  }
  return false;
}
