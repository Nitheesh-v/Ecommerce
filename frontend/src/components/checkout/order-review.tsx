"use client";

// src/components/checkout/order-review.tsx

/**
 * Step 3 of checkout: what is being bought, what it costs, and the button.
 *
 * The totals are the ones the preview returned — this component formats them and
 * never adds anything up. The note is optional and stored on the order's history.
 */
import Link from "next/link";
import { ImageOff, Loader2, Lock, ShoppingBag } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/components/ui/format-currency";
import { PriceBreakdown } from "@/components/cart/order-summary";
import type { AppliedCoupon, CartTotals, CheckoutLine, CheckoutPaymentMethod } from "@/types/cart";

const NOTE_LIMIT = 500;

export function OrderReview({
  items,
  totals,
  coupon,
  paymentMethod,
  notes,
  onNotesChange,
  onPlace,
  placing,
  disabled = false,
  error,
}: {
  items: CheckoutLine[];
  totals: CartTotals;
  coupon: AppliedCoupon | null;
  paymentMethod: CheckoutPaymentMethod;
  notes: string;
  onNotesChange: (notes: string) => void;
  onPlace: () => void;
  placing: boolean;
  disabled?: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
        {items.map((item) => {
          const image = resolveImageUrl(item.imageUrl);

          return (
            <li key={item.productId} className="flex items-center gap-3 p-2.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <ImageOff className="h-4 w-4 text-slate-300" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                <p className="text-[11px] text-slate-500">
                  {item.quantity} × {formatPrice(item.unitPrice, totals.currency)}
                  {item.sku ? ` · ${item.sku}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-slate-900">
                {formatPrice(item.lineTotal, totals.currency)}
              </span>
            </li>
          );
        })}
      </ul>

      <PriceBreakdown totals={totals} coupon={coupon} />

      <label className="block">
        <span className="mb-1 flex items-baseline justify-between text-[11px] font-medium text-slate-600">
          Delivery note (optional)
          <span className="text-slate-400">
            {notes.length}/{NOTE_LIMIT}
          </span>
        </span>
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value.slice(0, NOTE_LIMIT))}
          rows={2}
          disabled={placing || disabled}
          placeholder="Gate code, best time to deliver…"
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50"
        />
      </label>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          {error}
          <Link
            href="/cart"
            className="mt-1 block font-medium text-rose-900 underline-offset-2 hover:underline"
          >
            Review your cart
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPlace}
        disabled={placing || disabled}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70",
          paymentMethod === "cod"
            ? "bg-green-600 hover:bg-green-500"
            : "bg-blue-600 hover:bg-blue-500",
        )}
      >
        {placing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ShoppingBag className="h-4 w-4" aria-hidden />
        )}
        {placing
          ? "Placing your order…"
          : paymentMethod === "cod"
            ? `Place order · Pay ${formatPrice(totals.total, totals.currency)} on delivery`
            : `Pay ${formatPrice(totals.total, totals.currency)} securely`}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
        <Lock className="h-3 w-3" aria-hidden />
        Prices include all taxes. Payment details never touch this store.
      </p>
    </div>
  );
}
