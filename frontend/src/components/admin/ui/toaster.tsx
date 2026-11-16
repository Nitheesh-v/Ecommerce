"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastVariant } from "@/store/toast.store";

const STYLES: Record<ToastVariant, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-emerald-600" },
  error: { icon: AlertCircle, className: "text-rose-600" },
  info: { icon: Info, className: "text-baby-700" },
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
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-cream-300 bg-cream-50 px-4 py-3 shadow-lg shadow-bark-900/10"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} aria-hidden />
            <p className="flex-1 text-sm text-bark-800">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="rounded p-1 text-bark-400 transition-colors hover:bg-cream-200 hover:text-bark-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
