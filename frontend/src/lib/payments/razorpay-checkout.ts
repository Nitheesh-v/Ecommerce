"use client";

import { checkoutService } from "@/services/store/payments.service";
import type { CheckoutSession, VerifyPaymentResult } from "@/types/payment";

/**
 * Razorpay Checkout integration (browser side).
 *
 * Security model:
 *  - the widget only ever receives the **publishable** key id and an order id the
 *    server created for the exact order total;
 *  - the success callback is *not* trusted: its ids and signature are posted to
 *    `/api/payments/verify`, and only the server's answer marks anything paid;
 *  - no card data ever touches this code — the widget is hosted by Razorpay.
 */

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailureResponse {
  error?: { description?: string; reason?: string };
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  retry?: { enabled?: boolean };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: RazorpayFailureResponse) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<void> | null = null;

/** Loads the hosted checkout script once per page session. */
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout can only open in a browser"));
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SCRIPT}"]`,
    );

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("The payment checkout could not be loaded")),
      );

      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("The payment checkout could not be loaded"));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Everything the widget needs, independent of where it came from.
 *
 * Two flows use this: paying for an order that already exists
 * (`openCheckout`, `/api/payments`) and placing a new order at checkout
 * (`/api/checkout`). The widget only ever sees a publishable key and an order id
 * the server created for the exact amount.
 */
export interface RazorpaySession {
  keyId: string | null;
  amount: number;
  currency: string;
  gatewayOrderId: string;
  /** Shown on the widget, e.g. `ORD-20261105-0001`. */
  orderNumber: string;
  prefill?: { name: string; email: string; contact?: string };
  notes?: Record<string, string>;
  description?: string;
}

export interface RazorpayIds {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}

export interface RazorpayHandlers {
  /** The widget says the payment went through — verify it before believing it. */
  onSuccess: (ids: RazorpayIds) => void | Promise<void>;
  onFailed?: (message: string) => void;
  onDismissed?: () => void;
}

export interface PayOrderHandlers {
  onVerified: (result: VerifyPaymentResult) => void;
  /** The widget reported a failure (declined card, etc.). */
  onFailed?: (message: string) => void;
  /** The customer closed the widget without paying. */
  onDismissed?: () => void;
}

/**
 * Opens the hosted widget for a server-created gateway order.
 *
 * Nothing here is trusted: `onSuccess` is where the caller verifies the ids with
 * the API, and only the server's answer may change a status.
 */
export async function openRazorpay(
  session: RazorpaySession,
  handlers: RazorpayHandlers,
): Promise<void> {
  if (!session.keyId) {
    throw new Error("Online payments are not configured on this server");
  }

  await loadRazorpayCheckout();

  const RazorpayConstructor = window.Razorpay;

  if (!RazorpayConstructor) {
    throw new Error("The payment checkout could not be loaded");
  }

  const checkout = new RazorpayConstructor({
    key: session.keyId,
    amount: session.amount,
    currency: session.currency,
    name: "Ecommerce26",
    description: session.description ?? `Order ${session.orderNumber}`,
    order_id: session.gatewayOrderId,
    prefill: session.prefill,
    notes: session.notes,
    theme: { color: "#0f172a" },
    retry: { enabled: false },
    modal: {
      ondismiss: () => handlers.onDismissed?.(),
    },
    handler: (response) => {
      void (async () => {
        try {
          await handlers.onSuccess({
            gatewayOrderId: response.razorpay_order_id,
            gatewayPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        } catch (error) {
          handlers.onFailed?.(
            error instanceof Error
              ? error.message
              : "The payment could not be verified",
          );
        }
      })();
    },
  });

  checkout.on("payment.failed", (response) => {
    handlers.onFailed?.(
      response.error?.description ?? "The payment was declined by the bank",
    );
  });

  checkout.open();
}

/**
 * Opens the checkout for a session returned by `POST /api/payments/create-order`
 * and verifies the result server-side.
 */
export async function openCheckout(
  session: CheckoutSession,
  handlers: PayOrderHandlers,
): Promise<void> {
  await openRazorpay(session, {
    onSuccess: async (ids) => {
      const result = await checkoutService.verify(ids);

      handlers.onVerified(result);
    },
    onFailed: handlers.onFailed,
    onDismissed: handlers.onDismissed,
  });
}
