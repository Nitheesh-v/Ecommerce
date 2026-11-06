"use client";

// src/components/cart/cart-view.tsx

/**
 * The cart page.
 *
 * Signed-out shoppers are *invited* to sign in rather than bounced to `/login`: a
 * cart is per-account on the server, but the page itself is perfectly readable and
 * a forced redirect would lose the visitor's place.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  LogIn,
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

  useEffect(() => {
    if (authStatus === "authenticated" && status === "idle") {
      void fetchCart();
    }
  }, [authStatus, fetchCart, status]);

  const loading =
    authStatus === "idle" ||
    authStatus === "loading" ||
    (authStatus === "authenticated" && (status === "idle" || status === "loading"));

  if (loading) {
    return <CartSkeleton />;
  }

  if (authStatus === "unauthenticated" || status === "signed-out") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
        <LogIn className="mx-auto h-7 w-7 text-slate-300" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
          Sign in to view your cart
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Your cart is saved to your account, so it is the same on every device.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link
            href="/login?next=%2Fcart"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/register?next=%2Fcart"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Create an account
          </Link>
        </div>
        <Link
          href="/products"
          className="mt-4 inline-block text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          Keep browsing products
        </Link>
      </div>
    );
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
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </button>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <ShoppingBag className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
          Your cart is empty
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Nothing here yet — find something you like and it will wait for you.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Start shopping
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    );
  }

  const blocked = cart.unavailableCount > 0;
  const showIssue = cart.couponIssue !== null && dismissedIssue !== cart.couponIssue;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Shopping cart
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {cart.totals.itemCount} {cart.totals.itemCount === 1 ? "item" : "items"} in
            your cart
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
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
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <ul className="divide-y divide-slate-100">
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
            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          />

          <OrderSummary totals={cart.totals} coupon={cart.coupon}>
            {blocked ? (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500"
              >
                Proceed to checkout
              </button>
            ) : (
              <Link
                href="/checkout"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
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
              className="block w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800"
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
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-70"
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
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
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
