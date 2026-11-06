"use client";

// src/components/checkout/checkout-view.tsx

/**
 * Checkout.
 *
 * Three collapsible steps — address, payment, review — over one server-priced
 * cart. Nothing is written until "Place order", and even then the amount comes from
 * the order the server creates, never from this page.
 *
 * The flow is deliberately conservative about trust:
 *  - the preview is a dry run, re-run whenever the address or method changes;
 *  - placing re-validates stock, the coupon and the COD limit server-side;
 *  - the gateway's success callback is verified by the API before the browser is
 *    allowed to say "paid".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { fetchPublic } from "@/lib/api/public";
import { openRazorpay } from "@/lib/payments/razorpay-checkout";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/components/ui/format-currency";
import { checkoutApi } from "@/services/store/cart.service";
import { addressService } from "@/services/store/address.service";
import { useCartStore } from "@/store/cart.store";
import { useCustomerAuthStore } from "@/store/customer-auth.store";
import type { Address } from "@/types/address";
import type {
  CheckoutPaymentMethod,
  CheckoutPaymentOptions,
  CheckoutPreview,
} from "@/types/cart";
import type { CheckoutConfig } from "@/types/payment";
import type { PublicStoreSettings } from "@/types/settings";
import { AddressSelector } from "./address-selector";
import { OrderReview } from "./order-review";
import { PaymentSelector } from "./payment-selector";

type Section = 1 | 2 | 3;

const FALLBACK_OPTIONS: CheckoutPaymentOptions = {
  codAvailable: false,
  codMaxAmount: 0,
  onlineAvailable: false,
  currency: "INR",
};

export function CheckoutView() {
  const router = useRouter();

  const authStatus = useCustomerAuthStore((state) => state.status);
  const bootstrap = useCustomerAuthStore((state) => state.bootstrap);

  const cart = useCartStore((state) => state.cart);
  const cartStatus = useCartStore((state) => state.status);
  const fetchCart = useCartStore((state) => state.fetchCart);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("online");
  const [options, setOptions] = useState<CheckoutPaymentOptions | null>(null);

  /**
   * The preview is stored with the key it was computed for, so switching address or
   * method cannot show a stale price while the new one loads — no state has to be
   * cleared inside an effect to achieve that.
   */
  const [previewState, setPreviewState] = useState<{
    key: string;
    data: CheckoutPreview | null;
    error: string | null;
  } | null>(null);

  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>(1);

  /** One key per checkout attempt, so a double submit cannot create two orders. */
  const idempotencyKey = useRef<string | null>(null);

  // ----------------------------------------------------------- session & data

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/login?next=%2Fcheckout");
    }
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus === "authenticated" && cartStatus === "idle") {
      void fetchCart();
    }
  }, [authStatus, cartStatus, fetchCart]);

  useEffect(() => {
    if (placedOrderId || authStatus !== "authenticated") {
      return;
    }

    if (cartStatus === "ready" && cart && cart.items.length === 0) {
      router.replace("/cart");
    }
  }, [authStatus, cart, cartStatus, placedOrderId, router]);

  const selectInitialAddress = useCallback((list: Address[]) => {
    setAddressId((current) => {
      if (current && list.some((address) => address.id === current)) {
        return current;
      }

      return list.find((address) => address.isDefault)?.id ?? list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    let active = true;

    addressService
      .list()
      .then((list) => {
        if (!active) {
          return;
        }

        setAddresses(list);
        selectInitialAddress(list);
        setAddressError(null);
      })
      .catch((error: unknown) => {
        if (active) {
          setAddressError(getApiErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) {
          setAddressesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authStatus, selectInitialAddress]);

  /** Retry, from a click — not from an effect. */
  const reloadAddresses = async () => {
    setAddressesLoading(true);
    setAddressError(null);

    try {
      const list = await addressService.list();

      setAddresses(list);
      selectInitialAddress(list);
    } catch (error) {
      setAddressError(getApiErrorMessage(error));
    } finally {
      setAddressesLoading(false);
    }
  };

  /** Payment availability straight from the public endpoints, before any preview. */
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [store, config] = await Promise.all([
          fetchPublic<PublicStoreSettings>("/store/settings"),
          fetchPublic<CheckoutConfig>("/payments/config"),
        ]);

        if (!active) {
          return;
        }

        setOptions({
          codAvailable: store.codEnabled,
          codMaxAmount: store.codMaxAmount ?? 0,
          onlineAvailable: config.enabled,
          currency: store.currency ?? "INR",
        });
      } catch {
        if (active) {
          setOptions(FALLBACK_OPTIONS);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // ------------------------------------------------------------------ preview

  const cartTotal = cart?.totals.total ?? 0;
  const cartKey = cart ? `${cart.updatedAt ?? ""}:${cart.totals.total}:${cart.items.length}` : "";
  const codAllowed = options
    ? options.codAvailable && (options.codMaxAmount === 0 || cartTotal <= options.codMaxAmount)
    : false;

  /**
   * The method actually used: if the preferred one is unavailable (COD switched off,
   * or the total exceeds its cap) and the other one works, use the other one. Derived
   * rather than written into state, so it cannot drift from `options`.
   */
  const method: CheckoutPaymentMethod =
    options && paymentMethod === "cod" && !codAllowed && options.onlineAvailable
      ? "online"
      : options && paymentMethod === "online" && !options.onlineAvailable && codAllowed
        ? "cod"
        : paymentMethod;

  const previewKey = `${addressId ?? ""}|${method}|${cartKey}`;
  const canPreview = Boolean(
    addressId && cart && cart.items.length > 0 && cart.unavailableCount === 0,
  );
  const preview =
    previewState && previewState.key === previewKey ? previewState.data : null;
  const previewError =
    previewState && previewState.key === previewKey ? previewState.error : null;
  const previewLoading = canPreview && (!previewState || previewState.key !== previewKey);

  useEffect(() => {
    if (!canPreview || !addressId) {
      return;
    }

    const controller = new AbortController();

    checkoutApi
      .previewCheckout({ addressId, paymentMethod: method }, controller.signal)
      .then((result) => {
        setPreviewState({ key: previewKey, data: result, error: null });
        setOptions(result.paymentOptions);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }

        setPreviewState({
          key: previewKey,
          data: null,
          error: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [addressId, canPreview, method, previewKey]);

  const selectedAddress = addresses.find((address) => address.id === addressId) ?? null;
  const totals = preview?.totals ?? cart?.totals ?? null;

  // -------------------------------------------------------------------- place

  const place = async () => {
    if (!addressId) {
      setPlaceError("Choose a delivery address first");
      setSection(1);

      return;
    }

    setPlacing(true);
    setPlaceError(null);
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const placed = await checkoutApi.placeOrder({
        addressId,
        paymentMethod: method,
        customerNote: notes.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      });

      setPlacedOrderId(placed.orderId);
      // The server already emptied it; this is what moves the header badge.
      void fetchCart();

      if (!placed.requiresPayment) {
        router.push(`/checkout/success?orderId=${placed.orderId}`);

        return;
      }

      if (!placed.payment) {
        setPlaceError(
          `Order ${placed.orderNumber} was created but no payment could be started. Open it from “My orders” to pay.`,
        );
        setPlacing(false);

        return;
      }

      await openRazorpay(
        {
          keyId: placed.payment.keyId,
          amount: placed.payment.amount,
          currency: placed.payment.currency,
          gatewayOrderId: placed.payment.gatewayOrderId,
          orderNumber: placed.orderNumber,
          prefill: placed.payment.prefill,
          description: `Order ${placed.orderNumber}`,
          notes: { orderId: placed.orderId },
        },
        {
          onSuccess: async (ids) => {
            try {
              await checkoutApi.verifyPayment(ids);
              router.push(`/checkout/success?orderId=${placed.orderId}`);
            } catch (error) {
              // The order exists; only the confirmation failed. Say so honestly.
              setPlaceError(
                `${getApiErrorMessage(error)} — order ${placed.orderNumber} is saved; you can retry the payment from “My orders”.`,
              );
              setPlacing(false);
            }
          },
          onFailed: (message) => {
            setPlaceError(
              `${message} — order ${placed.orderNumber} is saved; you can retry the payment from “My orders”.`,
            );
            setPlacing(false);
          },
          onDismissed: () => {
            setPlaceError(
              `Payment was not completed. Order ${placed.orderNumber} is saved — pay for it from “My orders”.`,
            );
            setPlacing(false);
          },
        },
      );
    } catch (error) {
      setPlaceError(getApiErrorMessage(error));
      setPlacing(false);
    }
  };

  // ------------------------------------------------------------------- render

  if (
    authStatus === "idle" ||
    authStatus === "loading" ||
    authStatus === "unauthenticated" ||
    cartStatus === "idle" ||
    cartStatus === "loading"
  ) {
    return <CheckoutSkeleton />;
  }

  if (cartStatus === "error") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-10 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-rose-500" aria-hidden />
        <p className="mt-3 text-sm font-medium text-rose-900">Checkout is unavailable</p>
        <p className="mt-1 text-xs text-rose-800">
          We could not load your cart. Please try again.
        </p>
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
    return <CheckoutSkeleton />;
  }

  const blockedByStock = cart.unavailableCount > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Checkout</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {cart.totals.itemCount} {cart.totals.itemCount === 1 ? "item" : "items"} ·{" "}
            {formatPrice(cart.totals.total, cart.totals.currency)}
          </p>
        </div>
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Back to cart
        </Link>
      </div>

      {blockedByStock ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          <p className="text-xs text-rose-900">
            Some items are no longer available.{" "}
            <Link href="/cart" className="font-semibold underline-offset-2 hover:underline">
              Review your cart
            </Link>{" "}
            before checking out.
          </p>
        </div>
      ) : null}

      <CheckoutSection
        index={1}
        title="Delivery address"
        icon={MapPin}
        open={section === 1}
        complete={Boolean(addressId)}
        summary={
          selectedAddress
            ? `${selectedAddress.recipientName}, ${selectedAddress.city} ${selectedAddress.postalCode}`
            : "No address yet"
        }
        onOpen={() => setSection(1)}
      >
        <AddressSelector
          addresses={addresses}
          selectedId={addressId}
          onSelect={(id) => {
            setAddressId(id);
            setSection(2);
          }}
          onCreated={(created) => {
            setAddresses((current) => [created, ...current]);
            setAddressId(created.id);
            setSection(2);
          }}
          loading={addressesLoading}
          disabled={placing}
        />

        {addressError ? (
          <p role="alert" className="mt-2 text-xs text-rose-600">
            {addressError}{" "}
            <button
              type="button"
              onClick={() => void reloadAddresses()}
              className="font-medium underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </p>
        ) : null}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!addressId || placing}
            onClick={() => setSection(2)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Continue to payment
          </button>
        </div>
      </CheckoutSection>

      <CheckoutSection
        index={2}
        title="Payment method"
        icon={CreditCard}
        open={section === 2}
        complete={
          Boolean(addressId) &&
          (method === "online" ? Boolean(options?.onlineAvailable) : codAllowed)
        }
        summary={
          method === "cod" ? "Cash on delivery" : "Pay online (card / UPI / net banking)"
        }
        onOpen={() => setSection(2)}
      >
        {options ? (
          <PaymentSelector
            value={method}
            onChange={setPaymentMethod}
            options={options}
            total={cartTotal}
            disabled={placing}
          />
        ) : (
          <Skeleton className="h-24 w-full rounded-xl" />
        )}

        <div className="mt-3 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => setSection(1)}
            disabled={placing}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Back
          </button>
          <button
            type="button"
            disabled={placing || !addressId}
            onClick={() => setSection(3)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Review order
          </button>
        </div>
      </CheckoutSection>

      <CheckoutSection
        index={3}
        title="Review & place order"
        icon={PackageCheck}
        open={section === 3}
        complete={false}
        summary={
          totals ? `${formatPrice(totals.total, totals.currency)} payable` : "Not priced yet"
        }
        onOpen={() => setSection(3)}
      >
        {previewLoading && !preview ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : previewError ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
          >
            <p>{previewError}</p>
            <div className="mt-1.5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setSection(addressId ? 2 : 1)}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Change address or payment method
              </button>
              <Link
                href="/cart"
                className="font-semibold underline-offset-2 hover:underline"
              >
                Review cart
              </Link>
            </div>
          </div>
        ) : preview && totals ? (
          <OrderReview
            items={preview.items}
            totals={totals}
            coupon={preview.coupon}
            paymentMethod={method}
            notes={notes}
            onNotesChange={setNotes}
            onPlace={() => void place()}
            placing={placing}
            disabled={!addressId || blockedByStock}
            error={placeError}
          />
        ) : (
          <p className="text-xs text-slate-500">
            Choose an address and a payment method to see the final total.
          </p>
        )}

        {previewLoading && preview ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Recalculating…
          </p>
        ) : null}
      </CheckoutSection>
    </div>
  );
}

function CheckoutSection({
  index,
  title,
  icon: Icon,
  open,
  complete,
  summary,
  onOpen,
  children,
}: {
  index: Section;
  title: string;
  icon: typeof MapPin;
  open: boolean;
  complete: boolean;
  summary: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            complete
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-900 text-white",
          )}
        >
          {index}
        </span>
        <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{summary}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}
