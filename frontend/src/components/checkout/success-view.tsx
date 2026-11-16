"use client";

import Image from "next/image";

// src/components/checkout/success-view.tsx

/**
 * Order confirmation.
 *
 * The page reads the order back from the API rather than trusting what the previous
 * screen remembered, so a reload or a bookmark shows the same thing — and a customer
 * who opens somebody else's order id simply gets a friendly refusal (the API
 * answers 404 for an order that is not theirs).
 */
import { useEffect, useState, type FormEvent } from "react";
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
import { guestOrderEmail } from "@/lib/store/guest-cart";
import { myOrdersService } from "@/services/store/orders.service";
import { useCustomerAuthStore } from "@/store/customer-auth.store";
import { toast } from "@/store/toast.store";
import type { Order } from "@/types/order";

type State =
  | { status: "loading" }
  | { status: "ready"; order: Order }
  | { status: "error"; message: string };

export function SuccessView({ orderId }: { orderId: string }) {
  const authStatus = useCustomerAuthStore((state) => state.status);
  const bootstrap = useCustomerAuthStore((state) => state.bootstrap);

  const [state, setState] = useState<State>(() =>
    orderId
      ? { status: "loading" }
      : { status: "error", message: "No order was specified." },
  );

  /**
   * A guest has no session, so their confirmation is read with the number + email
   * they typed (remembered at checkout). `null` means "ask for the email".
   */
  const [email, setEmail] = useState<string | null>(() =>
    orderId ? guestOrderEmail.get(orderId) : null,
  );
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!orderId || authStatus === "idle" || authStatus === "loading") {
      return;
    }

    const signedIn = authStatus === "authenticated";

    if (!signedIn && !email) {
      // Nothing to fetch yet — the email form collects the missing half of the pair.
      // Derived in render rather than written to state from here.
      return;
    }

    const controller = new AbortController();
    let active = true;

    const read = signedIn
      ? myOrdersService.get(orderId, controller.signal)
      : myOrdersService.guestLookup(orderId, email ?? "", controller.signal);

    read
      .then((order) => {
        if (active) {
          setState({ status: "ready", order });
        }
      })
      .catch((error: unknown) => {
        if (active && !isAbortError(error)) {
          setState({ status: "error", message: getApiErrorMessage(error) });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [authStatus, email, orderId]);

  /**
   * Guests are asked for the email rather than shown only a refusal. The API needs
   * both halves of the pair, and the person in front of the screen is the one person
   * who knows which address they used.
   */
  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const value = emailDraft.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setEmailError("Enter the email address you used at checkout");

      return;
    }

    setEmailError(null);
    guestOrderEmail.remember(orderId, value);
    setState({ status: "loading" });
    setEmail(value);
  };

  /**
   * A guest with no remembered email has half a credential; the form is the other
   * half. Derived, so it reads the same before and after the fetch gives up.
   */
  const needsEmail = authStatus === "unauthenticated" && !email;

  if (state.status === "loading" && !needsEmail) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Skeleton className="mx-auto h-16 w-16 rounded-full" />
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === "error" || needsEmail) {
    const signedIn = authStatus === "authenticated";
    const message = state.status === "error" ? state.message : "";

    return (
      <div className="mx-auto max-w-md rounded-2xl border border-cream-300 bg-cream-50 px-6 py-12">
        <PackageCheck className="mx-auto h-7 w-7 text-cream-400" aria-hidden />

        {needsEmail ? (
          <>
            <h1 className="mt-3 text-center text-lg font-semibold text-bark-900">
              Open your order
            </h1>
            <p className="mt-1.5 text-center text-sm text-bark-500">
              Enter the email you used at checkout and we will show the order.
            </p>

            <form onSubmit={submitEmail} className="mt-5 space-y-2" noValidate>
              <label htmlFor="order-email" className="block text-xs font-medium text-bark-700">
                Email
              </label>
              <input
                id="order-email"
                type="email"
                autoComplete="email"
                value={emailDraft}
                onChange={(event) => {
                  setEmailDraft(event.target.value);
                  setEmailError(null);
                }}
                placeholder="you@example.com"
                aria-invalid={emailError ? true : undefined}
                className="w-full rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-bark-900 placeholder:text-bark-400 focus:border-bark-300 focus:ring-2 focus:ring-baby-300 focus:outline-none"
              />
              {emailError ? (
                <p role="alert" className="text-[11px] text-rose-600">
                  {emailError}
                </p>
              ) : null}
              <button
                type="submit"
                className="w-full rounded-lg bg-baby-400 px-4 py-2 text-sm font-medium text-bark-950 transition-colors hover:bg-baby-300"
              >
                Show my order
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-center text-lg font-semibold text-bark-900">
              We could not open that order
            </h1>
            <p className="mt-1.5 text-center text-sm text-bark-500">{message}</p>
            {!signedIn ? (
              <button
                type="button"
                onClick={() => {
                  setEmail(null);
                  setEmailDraft("");
                  setEmailError(null);
                }}
                className="mt-3 w-full text-center text-xs font-medium text-bark-600 underline underline-offset-2 hover:text-bark-900"
              >
                Try a different email
              </button>
            ) : null}
          </>
        )}

        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          {signedIn ? (
            <Link
              href="/account/orders"
              className="inline-flex items-center justify-center rounded-lg bg-baby-400 px-4 py-2 text-sm font-medium text-bark-950 hover:bg-baby-300"
            >
              My orders
            </Link>
          ) : (
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-baby-400 px-4 py-2 text-sm font-medium text-bark-950 hover:bg-baby-300"
            >
              Create an account
            </Link>
          )}
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

  if (state.status !== "ready") {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
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
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cream-300 bg-cream-100">
                  {image ? (
                    <Image src={image} alt="" fill sizes="40px" className="object-cover" />
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
