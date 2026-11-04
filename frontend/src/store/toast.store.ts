"use client";

import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (variant: ToastVariant, message: string) => void;
  dismiss: (id: string) => void;
}

const DISMISS_AFTER_MS = 5_000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (variant, message) => {
    const id = crypto.randomUUID();

    set((state) => ({ toasts: [...state.toasts, { id, variant, message }] }));

    setTimeout(() => get().dismiss(id), DISMISS_AFTER_MS);
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Imperative helper usable outside React (services, event handlers). */
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
  info: (message: string) => useToastStore.getState().push("info", message),
};
