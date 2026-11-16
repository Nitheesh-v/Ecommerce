"use client";

// src/components/cart/cart-view.tsx

/**
 * The cart page.
 *
 * Works for everyone. A signed-in shopper's cart is keyed to their account; a
 * signed-out one is keyed to the guest id this browser holds, so the page shows a
 * real basket either way. Signing in is offered — and rewarded, because the guest
 * cart merges into the account — but never required to shop.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Info,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Dialog } from "@/components/admin/ui/dialog";
import { Skeleton } from "@/components/admin/ui/states";
import { useCustomerAuthStore } from "@/store/customer-auth.store";
import { useCartStore } from "@/store/cart.store";
import { CouponInput } from "./coupon-input";
import { CartItemRow } from "./cart-item";
import { OrderSummary } from "./order-summary";

export function CartView() {
  const authStatus = useCustomerAuthStore((state) => state.status);
  const bootstrap = useCustomerAuthStore((state) => state.bootstrap);

  const cart = useCartStore((state) => state.cart);
  const status = useCartStore((state) => state.status);
  const error = useCartStore((state) => state.error);
  const updatingItemId = useCartStore((state) => state.updatingItemId);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dismissedIssue, setDismissedIssue] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  /*
   * The cart is loaded whichever way the shopper arrived. The only wait worth a
   * skeleton is the session check: until the customer store has restored (or ruled
   * out) a session, a fetch would ask for the wrong cart and then be replaced.
   */
  useEffect(() => {
    if (authStatus === "idle" || authStatus === "loading") {
      return;
    }

    if (status === "idle") {
      void fetchCart();
    }
  }, [authStatus, fetchCart, status]);

  const loading =
    authStatus === "idle" ||
    authStatus === "loading" ||
    status === "idle" ||
    status === "loading";

  if (loading) {
    return <CartSkeleton />;
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-10 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-rose-500" aria-hidden />
        <p className="mt-3 text-sm font-medium text-rose-900">
          We could not load your cart
        </p>
        <p className="mt-1 text-xs text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => void fetchCart()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-cream-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </button>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-cream-400 bg-cream-50 px-6 py-14 text-center">
        <ShoppingBag className="mx-auto h-8 w-8 text-cream-400" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold tracking-tight text-bark-900">
          Your cart is empty
        </h1>
        <p className="mt-1.5 text-sm text-bark-500">
          Nothing here yet — find something you like and it will wait for you.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-baby-400 px-4 py-2 text-sm font-medium text-bark-950 transition-colors hover:bg-baby-300"
        >
          Start shopping
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    );
  }

  const blocked = cart.unavailableCount > 0;
  const showIssue = cart.couponIssue !== null && dismissedIssue !== cart.couponIssue;
  const isGuest = authStatus !== "authenticated";

  return (
    <div className="space-y-4">
      {isGuest ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-baby-200 bg-baby-50 px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs text-bark-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-baby-700" aria-hidden />
            This cart is saved in this browser. Sign in and it comes with you.
          </p>
          <Link
            href="/login?next=%2Fcart"
            className="shrink-0 rounded-lg border border-bark-900/15 bg-cream-50 px-2.5 py-1 text-[11px] font-semibold text-bark-900 transition-colors hover:bg-cream-100"
          >
            Sign in
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-bark-900">
            Shopping cart
          </h1>
          <p className="mt-0.5 text-sm text-bark-500">
            {cart.totals.itemCount} {cart.totals.itemCount === 1 ? "item" : "items"} in
            your cart
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-bark-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Clear cart
        </button>
      </div>

      {showIssue ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p className="text-xs text-amber-900">
              {cart.couponIssue} — it has been removed from your cart.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissedIssue(cart.couponIssue)}
            className="rounded px-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {blocked ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          <p className="text-xs text-rose-900">
            {cart.unavailableCount}{" "}
            {cart.unavailableCount === 1 ? "item is" : "items are"} no longer available.
            Remove {cart.unavailableCount === 1 ? "it" : "them"} to continue to checkout.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-sm lg:col-span-2">
          <ul className="divide-y divide-cream-200">
            {cart.items.map((item) => (
              <CartItemRow
                key={item.productId}
                item={item}
                currency={cart.totals.currency}
                updating={updatingItemId === item.productId}
                onQuantityChange={(quantity) => updateQuantity(item.productId, quantity)}
                onRemove={() => void removeItem(item.productId)}
              />
            ))}
          </ul>
        </section>

        <div className="space-y-3 lg:sticky lg:top-20">
          <CouponInput
            coupon={cart.coupon}
            currency={cart.totals.currency}
            className="rounded-2xl border border-cream-300 bg-cream-50 p-3 shadow-sm"
          />

          <OrderSummary totals={cart.totals} coupon={cart.coupon}>
            {blocked ? (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg bg-cream-300 px-4 py-2.5 text-sm font-semibold text-bark-500"
              >
                Proceed to checkout
              </button>
            ) : (
              <Link
                href="/checkout"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-baby-400 px-4 py-2.5 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
              >
                Proceed to checkout
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            {blocked ? (
              <p className="text-center text-[11px] text-rose-600">
                Remove the unavailable items to continue.
              </p>
            ) : null}
            <Link
              href="/products"
              className="block w-full text-center text-xs font-medium text-bark-500 hover:text-bark-900"
            >
              Continue shopping
            </Link>
          </OrderSummary>
        </div>
      </div>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear your cart?"
        description="Every item and the applied coupon will be removed. This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-lg border border-cream-300 px-3 py-2 text-sm font-medium text-bark-800 hover:bg-cream-100"
            >
              Keep items
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={() => {
                setClearing(true);
                void clearCart().finally(() => {
                  setClearing(false);
                  setConfirmClear(false);
                });
              }}
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-cream-50 hover:bg-rose-500 disabled:opacity-70"
            >
              {clearing ? "Clearing…" : "Yes, clear cart"}
            </button>
          </div>
        }
      />
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-cream-300 bg-cream-50 p-4 lg:col-span-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-3 py-3">
              <Skeleton className="h-20 w-20 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
