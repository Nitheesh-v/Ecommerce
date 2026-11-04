"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}

/**
 * Minimal dropdown: closes on outside click and Escape, and renders above a
 * transparent backdrop so page scroll is never blocked by a modal overlay.
 */
export function Popover({
  open,
  onClose,
  children,
  className,
  labelledBy,
}: PopoverProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default"
      />
      <div
        role="menu"
        aria-labelledby={labelledBy}
        className={cn(
          "absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
