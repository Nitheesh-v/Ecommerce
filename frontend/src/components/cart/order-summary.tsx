"use client";

// src/components/cart/order-summary.tsx

/**
 * The price breakdown, and the place the customer acts on it.
 *
 * Every number here comes from the server's cart totals — this component chooses
 * labels and colours, never arithmetic. `PriceBreakdown` is shared with checkout so
 * the cart and the order review can never show a different sum.
 */
import type { ReactNode } from "react";
import { Lock, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatFreeShippingGap,
  formatFreeShippingThreshold,
  formatPrice,
} from "@/components/ui/format-currency";
import type { AppliedCoupon, CartTotals } from "@/types/cart";

export function PriceBreakdown({
  totals,
  coupon,
  className,
}: {
  totals: CartTotals;
  coupon?: AppliedCoupon | null;
  className?: string;
}) {
  const savings = totals.discountTotal;
  const couponDiscount = totals.couponDiscount;

  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-bark-700">
          Subtotal{" "}
          <span className="text-bark-400">
            ({totals.itemCount} {totals.itemCount === 1 ? "item" : "items"})
          </span>
        </dt>
        <dd className="font-medium text-bark-900">
          {formatPrice(totals.subtotal, totals.currency)}
        </dd>
      </div>

      {savings > 0 ? (
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-bark-700">Discount</dt>
          <dd className="font-medium text-emerald-600">
            −{formatPrice(savings, totals.currency)}
          </dd>
        </div>
      ) : null}

      {couponDiscount > 0 || coupon ? (
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-bark-700">
            Coupon{coupon ? <span className="text-bark-400"> ({coupon.code})</span> : null}
          </dt>
          <dd className="font-medium text-emerald-600">
            {couponDiscount > 0
              ? `−${formatPrice(couponDiscount, totals.currency)}`
              : "Applied"}
          </dd>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-bark-700">
          Tax{" "}
          <span className="text-bark-400">
            {totals.taxRatePercent > 0 ? `(GST ${totals.taxRatePercent}%)` : "(GST)"}
          </span>
        </dt>
        <dd className="font-medium text-bark-900">
          {totals.taxAmount > 0
            ? formatPrice(totals.taxAmount, totals.currency)
            : "Included"}
        </dd>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <dt className="flex items-center gap-1.5 text-bark-700">
          Shipping
          {totals.shippingCharge === 0 ? (
            <Truck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          ) : null}
        </dt>
        <dd className="font-medium">
          {totals.shippingCharge === 0 ? (
            <span className="text-emerald-600">FREE</span>
          ) : (
            <span className="text-bark-900">
              {formatPrice(totals.shippingCharge, totals.currency)}
            </span>
          )}
        </dd>
      </div>

      {totals.freeShippingThreshold > 0 && totals.shippingCharge > 0 ? (
        <div className="space-y-1.5 pt-0.5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-cream-300"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              Math.min(
                100,
                ((totals.freeShippingThreshold - totals.freeShippingGap) /
                  totals.freeShippingThreshold) *
                  100,
              ),
            )}
            aria-label="Progress towards free shipping"
          >
            <div
              className="h-full rounded-full bg-baby-500 transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    0,
                    ((totals.freeShippingThreshold - totals.freeShippingGap) /
                      totals.freeShippingThreshold) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-bark-500">
            {totals.freeShippingGap > 0
              ? formatFreeShippingGap(totals.freeShippingGap, totals.currency)
              : formatFreeShippingThreshold(totals.freeShippingThreshold, totals.currency)}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-cream-300 pt-3">
        <dt className="text-base font-semibold text-bark-900">Total</dt>
        <dd className="text-base font-semibold text-bark-900">
          {formatPrice(totals.total, totals.currency)}
        </dd>
      </div>
    </dl>
  );
}

export function OrderSummary({
  totals,
  coupon,
  children,
  className,
}: {
  totals: CartTotals;
  coupon?: AppliedCoupon | null;
  /** The call to action — "Proceed to checkout" in the cart, "Place order" at checkout. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Order summary"
      className={cn(
        "rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-sm",
        className,
      )}
    >
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-bark-900">
        Order summary
      </h2>

      <PriceBreakdown totals={totals} coupon={coupon} />

      {children ? <div className="mt-4 space-y-2">{children}</div> : null}

      <p className="mt-3 text-[11px] text-bark-500">
        Prices inclusive of all taxes
      </p>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-cream-200 pt-3 text-[11px] text-bark-500">
        <li className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden /> Secure checkout
        </li>
        <li className="inline-flex items-center gap-1">
          <RotateCcw className="h-3 w-3" aria-hidden /> Free returns
        </li>
        <li className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Genuine products
        </li>
      </ul>
    </section>
  );
}
