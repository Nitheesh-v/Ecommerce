"use client";

import { create } from "zustand";
import { getApiErrorMessage } from "@/lib/api/errors";
import { session } from "@/lib/api/session";
import {
  authService,
  type LoginCredentials,
  type RegisterPayload,
} from "@/services/auth.service";
import type { AuthUser } from "@/types/auth";

export type CustomerAuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface CustomerAuthState {
  user: AuthUser | null;
  status: CustomerAuthStatus;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<AuthUser | null>;
  register: (payload: RegisterPayload) => Promise<AuthUser | null>;
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

/**
 * Shopper session.
 *
 * Deliberately separate from `auth.store.ts`: the admin store refuses any account
 * that is not an admin, and a storefront must not carry that rule. Both write to the
 * same in-memory `session`, because a browser has one session at a time and the API
 * has one refresh cookie.
 */
export const useCustomerAuthStore = create<CustomerAuthState>((set, get) => ({
  user: null,
  status: "idle",
  error: null,

  login: async (credentials) => {
    set({ status: "loading", error: null });

    try {
      const payload = await authService.login(credentials);

      session.set(payload);
      set({ user: payload.user, status: "authenticated", error: null });

      return payload.user;
    } catch (error) {
      set({ user: null, status: "unauthenticated", error: getApiErrorMessage(error) });

      return null;
    }
  },

  register: async (payload) => {
    set({ status: "loading", error: null });

    try {
      const result = await authService.register(payload);

      session.set(result);
      set({ user: result.user, status: "authenticated", error: null });

      return result.user;
    } catch (error) {
      set({ user: null, status: "unauthenticated", error: getApiErrorMessage(error) });

      return null;
    }
  },

  /**
   * Restores the session after a reload using the HttpOnly refresh cookie.
   * A failure is the normal first-visit path, not an error worth showing.
   */
  bootstrap: async () => {
    const { status } = get();

    if (status === "loading" || status === "authenticated") {
      return;
    }

    set({ status: "loading", error: null });

    try {
      const payload = await authService.refresh();

      session.set(payload);
      set({ user: payload.user, status: "authenticated" });
    } catch {
      session.clear();
      set((previous) => ({
        user: null,
        status: "unauthenticated",
        // Keep a message the client set (e.g. "session expired").
        error: previous.error,
      }));
    }
  },

  logout: async () => {
    await authService.logout().catch(() => undefined);
    session.clear();
    set({ user: null, status: "unauthenticated", error: null });
  },

  clearError: () => set({ error: null }),
}));
