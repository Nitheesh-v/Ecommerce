"use client";

import { create } from "zustand";

interface UiState {
  /** Desktop sidebar collapsed to icons only. */
  sidebarCollapsed: boolean;
  /** Mobile drawer visibility. */
  mobileNavOpen: boolean;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
