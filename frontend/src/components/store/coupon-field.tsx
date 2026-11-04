"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Tag, X } from "lucide-react";
import { useCouponPreview, type CouponCartLine } from "@/hooks/use-coupon-preview";
import { cn, formatCurrency } from "@/lib/utils";
import type { CouponValidation } from "@/types/offer";

/**
 * Reusable "apply a coupon" control.
 *
 * Drop it into a cart or checkout with the cart lines; it asks the API to price
 * the code and renders the discount breakdown it gets back. Nothing here decides
 * an amount — the server re-prices from its own catalogue, and checkout re-quotes
 * again before the order is written, so a tampered request cannot discount a cart.
 *
 * `onQuoteChange` lets the host page mirror the previewed totals.
 */
export function CouponField({
  lines,
  onQuoteChange,
  className,
}: {
  lines: CouponCartLine[];
  onQuoteChange?: (quote: CouponValidation | null) => void;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const { quote, error, pending, apply, remove } = useCouponPreview(lines);

  // Keep the host in sync without making it the source of truth.
  useEffect(() => {
    onQuoteChange?.(quote);
  }, [quote, onQuoteChange]);

  if (quote) {
    return (
      <div className={cn("rounded-xl border border-emerald-200 bg-emerald-50/60 p-3", className)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-emerald-900">
                {quote.code} applied — {quote.valueLabel}
              </p>
              <p className="text-xs text-emerald-800">{quote.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              remove();
              setCode("");
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          >
            <X className="h-3 w-3" aria-hidden />
            Remove
          </button>
        </div>

        <dl className="mt-3 space-y-1 border-t border-emerald-200/70 pt-2 text-xs text-emerald-900">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatCurrency(quote.subtotal, quote.currency)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Discount</dt>
            <dd>−{formatCurrency(quote.discount, quote.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>
              {quote.freeShipping || quote.shippingCharge === 0
                ? "Free"
                : formatCurrency(quote.shippingCharge, quote.currency)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax</dt>
            <dd>{formatCurrency(quote.taxAmount, quote.currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-emerald-200/70 pt-1 text-sm font-semibold">
            <dt>Total</dt>
            <dd>{formatCurrency(quote.total, quote.currency)}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor="coupon-code"
        className="flex items-center gap-1.5 text-xs font-medium text-slate-700"
      >
        <Tag className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        Have a coupon code?
      </label>

      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void apply(code);
            }
          }}
          placeholder="DIWALI20"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 font-mono text-sm tracking-wide text-slate-900 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void apply(code)}
          disabled={pending || code.trim() === ""}
          className="h-10 shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:bg-slate-300"
        >
          {pending ? "Checking…" : "Apply"}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          The discount is calculated on our servers when the code is applied.
        </p>
      )}
    </div>
  );
}
