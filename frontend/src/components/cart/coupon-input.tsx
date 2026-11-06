"use client";

// src/components/cart/coupon-input.tsx

/**
 * Apply / remove the cart's coupon.
 *
 * The code is validated by the server against the live cart before it is stored,
 * so an expired or ineligible code fails here — not at the last step of checkout.
 * No discount is ever computed in the browser; the store keeps whatever the API
 * returned.
 */
import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDiscount } from "@/components/ui/format-currency";
import { useCartStore } from "@/store/cart.store";
import type { AppliedCoupon } from "@/types/cart";

export function CouponInput({
  coupon,
  currency,
  className,
}: {
  coupon: AppliedCoupon | null;
  currency: string;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const applyCoupon = useCartStore((state) => state.applyCoupon);
  const removeCoupon = useCartStore((state) => state.removeCoupon);
  const pending = useCartStore((state) => state.couponPending);
  const error = useCartStore((state) => state.couponError);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!code.trim()) {
      return;
    }

    const applied = await applyCoupon(code);

    if (applied) {
      setCode("");
    }
  };

  if (coupon) {
    return (
      <div
        className={cn(
          "rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-900">
                {coupon.code} applied
              </p>
              <p className="text-[11px] text-emerald-800">
                {coupon.summary}
                {coupon.discount > 0
                  ? ` · ${formatDiscount(coupon.discount, currency)} off`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void removeCoupon()}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <X className="h-3 w-3" aria-hidden />
            )}
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={(event) => void submit(event)} className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Coupon code</span>
          <Tag
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Coupon code"
            autoComplete="off"
            maxLength={40}
            disabled={pending}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-2 pl-8 text-xs font-medium tracking-wide text-slate-900 uppercase placeholder:normal-case placeholder:tracking-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50"
          />
        </label>
        <button
          type="submit"
          disabled={pending || code.trim().length < 2}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-900 bg-white px-3 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {pending ? "Applying…" : "Apply"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] font-medium text-rose-600">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-500">
          Codes are checked against your cart before they are applied.
        </p>
      )}
    </div>
  );
}
