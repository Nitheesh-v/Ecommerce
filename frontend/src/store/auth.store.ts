"use client";

import { create } from "zustand";
import { getApiErrorMessage } from "@/lib/api/errors";
import { session } from "@/lib/api/session";
import { authService, type LoginCredentials } from "@/services/auth.service";
import type { AuthUser } from "@/types/auth";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  /**
   * Signs in and stores the access token in memory only.
   * Returns the user on success, or `null` when the credentials were rejected or
   * the account is not an admin (both cases set `error`).
   */
  login: (credentials: LoginCredentials) => Promise<AuthUser | null>;
  /** Restores the session on a hard reload using the refresh cookie. */
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const ADMIN_ONLY_MESSAGE =
  "This account does not have admin access. Sign in with an administrator account.";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  error: null,

  login: async (credentials) => {
    set({ status: "loading", error: null });

    try {
      const payload = await authService.login(credentials);

      if (payload.user.role !== "admin") {
        // Do not keep a customer session alive inside the/admin console.
        await authService.logout().catch(() => undefined);
        session.clear();
        set({ user: null, status: "unauthenticated", error: ADMIN_ONLY_MESSAGE });

        return null;
      }

      session.set(payload);
      set({ user: payload.user, status: "authenticated", error: null });

      return payload.user;
    } catch (error) {
      set({
        user: null,
        status: "unauthenticated",
        error: getApiErrorMessage(error),
      });

      return null;
    }
  },

  bootstrap: async () => {
    if (get().status === "loading" || get().status === "authenticated") {
      return;
    }

    set({ status: "loading", error: null });

    try {
      const payload = await authService.refresh();
      session.set(payload);
      set({ user: payload.user, status: "authenticated" });
    } catch {
      // No valid refresh cookie: this is the normal first-visit path.
      session.clear();
      set({ user: null, status: "unauthenticated" });
    }
  },

  logout: async () => {
    await authService.logout().catch(() => undefined);
    session.clear();
    set({ user: null, status: "unauthenticated", error: null });
  },

  clearError: () => set({ error: null }),
}));

/**
 * Keep the store in sync when the Axios interceptor refreshes or loses the
 * session outside of an action (e.g. a background 401 after 15 minutes).
 */
session.subscribe((payload) => {
  useAuthStore.setState(
    payload
      ? { user: payload.user, status: "authenticated", error: null }
      : { user: null, status: "unauthenticated" },
  );
});

session.onExpired(() => {
  useAuthStore.setState({
    user: null,
    status: "unauthenticated",
    error: "Your session expired. Please sign in again.",
  });
});
