"use client";

// src/components/cart/quantity-selector.tsx

/**
 * Quantity stepper for a cart line.
 *
 * Deliberately dumb: it renders `value` and reports `onChange`. The optimistic
 * update and the 500 ms debounce live in the cart store, so every caller gets the
 * same behaviour and the server stays the only writer.
 */
import { Loader2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuantitySelector({
  value,
  onChange,
  max = 99,
  disabled = false,
  updating = false,
  label = "Quantity",
  className,
}: {
  value: number;
  onChange: (quantity: number) => void;
  max?: number;
  disabled?: boolean;
  updating?: boolean;
  label?: string;
  className?: string;
}) {
  const decrease = () => {
    if (value > 1) {
      onChange(value - 1);
    }
  };

  const increase = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "inline-flex items-center rounded-lg border border-slate-200 bg-white",
          disabled && "opacity-60",
        )}
        role="group"
        aria-label={label}
      >
        <button
          type="button"
          onClick={decrease}
          disabled={disabled || value <= 1}
          aria-label="Decrease quantity"
          className="flex h-8 w-8 items-center justify-center rounded-l-lg text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span
          aria-live="polite"
          className="min-w-8 text-center text-sm font-medium text-slate-900"
        >
          {value}
        </span>
        <button
          type="button"
          onClick={increase}
          disabled={disabled || value >= max}
          aria-label="Increase quantity"
          className="flex h-8 w-8 items-center justify-center rounded-r-lg text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {updating ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Updating…
        </span>
      ) : null}
    </div>
  );
}
