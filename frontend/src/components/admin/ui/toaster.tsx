"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastVariant } from "@/store/toast.store";

const STYLES: Record<ToastVariant, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-emerald-600" },
  error: { icon: AlertCircle, className: "text-rose-600" },
  info: { icon: Info, className: "text-sky-600" },
};

/*
 * Bottom-right stack of transient messages.
 *
 * Rendered once per shell: `AdminShell` for the console and the storefront
 * `(store)` layout for the cart and the checkout. Rendering it twice would
 * double every message, so neither shell nests the other.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((item) => {
        const { icon: Icon, className } = STYLES[item.variant];

        return (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/5"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} aria-hidden />
            <p className="flex-1 text-sm text-slate-700">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
