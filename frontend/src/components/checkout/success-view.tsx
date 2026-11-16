"use client";

// src/components/checkout/success-view.tsx

/**
 * Order confirmation.
 *
 * The page reads the order back from the API rather than trusting what the previous
 * screen remembered, so a reload or a bookmark shows the same thing — and a customer
 * who opens somebody else's order id simply gets a friendly refusal (the API
 * answers 404 for an order that is not theirs).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  MapPin,
  PackageCheck,
  Truck,
} from "lucide-react";
import { Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { resolveImageUrl } from "@/lib/images";
import { formatPrice } from "@/components/ui/format-currency";
import { myOrdersService } from "@/services/store/orders.service";
import { toast } from "@/store/toast.store";
import type { Order } from "@/types/order";

type State =
  | { status: "loading" }
  | { status: "ready"; order: Order }
  | { status: "error"; message: string };

export function SuccessView({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>(() =>
    orderId
      ? { status: "loading" }
      : { status: "error", message: "No order was specified." },
  );

  useEffect(() => {
    if (!orderId) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    myOrdersService
      .get(orderId, controller.signal)
      .then((order) => {
        if (active) {
          setState({ status: "ready", order });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState({ status: "error", message: getApiErrorMessage(error) });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Skeleton className="mx-auto h-16 w-16 rounded-full" />
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-cream-300 bg-cream-50 px-6 py-12 text-center">
        <PackageCheck className="mx-auto h-7 w-7 text-cream-400" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-bark-900">
          We could not open that order
        </h1>
        <p className="mt-1.5 text-sm text-bark-500">{state.message}</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link
            href="/account/orders"
            className="inline-flex items-center justify-center rounded-lg bg-baby-400 px-4 py-2 text-sm font-medium text-bark-950 hover:bg-baby-300"
          >
            My orders
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center justify-center rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium text-bark-800 hover:bg-cream-100"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  const { order } = state;
  const paid = order.paymentStatus === "paid";
  const cod = order.paymentMethod === "cod";

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      toast.success("Order number copied");
    } catch {
      toast.error("Could not copy the order number");
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="rounded-2xl border border-cream-300 bg-cream-50 px-6 py-8 text-center shadow-sm">
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 animate-check-pop"
          aria-hidden
        >
          <svg viewBox="0 0 52 52" className="h-9 w-9" fill="none">
            <circle cx="26" cy="26" r="23" stroke="#10b981" strokeWidth="2" opacity="0.35" />
            <path
              className="animate-check-draw"
              d="M16 27.5 23 34l13-14"
              stroke="#059669"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h1 className="mt-4 text-xl font-semibold tracking-tight text-bark-900">
          {cod && !paid ? "Order placed" : "Payment successful"}
        </h1>
        <p className="mt-1 text-sm text-bark-500">
          {cod && !paid
            ? "Your order is confirmed. Pay the courier when it arrives."
            : "Your payment went through and your order is confirmed."}
        </p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cream-300 bg-cream-100 px-3 py-1.5">
          <span className="text-[11px] text-bark-500">Order number</span>
          <span className="font-mono text-sm font-semibold text-bark-900">
            {order.orderNumber}
          </span>
          <button
            type="button"
            onClick={() => void copyNumber()}
            aria-label="Copy order number"
            className="rounded p-1 text-bark-400 transition-colors hover:bg-cream-50 hover:text-bark-800"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link
            href={`/account/orders/${order.id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-baby-400 px-4 py-2.5 text-sm font-semibold text-bark-950 hover:bg-baby-300"
          >
            <Truck className="h-4 w-4" aria-hidden />
            Track your order
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cream-300 px-4 py-2.5 text-sm font-medium text-bark-800 hover:bg-cream-100"
          >
            Continue shopping
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-bark-900">What you ordered</h2>

        <ul className="mt-2 divide-y divide-cream-200">
          {order.items.map((item) => {
            const image = resolveImageUrl(item.imageUrl);

            return (
              <li key={`${item.sku}-${item.name}`} className="flex items-center gap-3 py-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cream-300 bg-cream-100">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <PackageCheck className="h-4 w-4 text-cream-400" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-bark-900">{item.name}</p>
                  <p className="text-[11px] text-bark-500">Quantity {item.quantity}</p>
                </div>
                <span className="text-sm font-medium text-bark-900">
                  {formatPrice(item.lineTotal, order.currency)}
                </span>
              </li>
            );
          })}
        </ul>

        <dl className="mt-3 space-y-1.5 border-t border-cream-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-bark-700">Payment</dt>
            <dd className="font-medium text-bark-900">
              {cod ? "Cash on delivery" : paid ? "Paid online" : "Payment pending"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bark-700">Total</dt>
            <dd className="font-semibold text-bark-900">
              {formatPrice(order.total, order.currency)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-bark-500">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Delivering to {order.shippingAddress.recipientName},{" "}
          {order.shippingAddress.city} {order.shippingAddress.postalCode}
        </p>
      </section>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-bark-500">
        <Check className="h-3 w-3 text-emerald-600" aria-hidden />
        A confirmation is available any time under “My orders”.
        <Link href="/account/orders" className="font-medium underline-offset-2 hover:underline">
          View
        </Link>
      </p>
    </div>
  );
}
