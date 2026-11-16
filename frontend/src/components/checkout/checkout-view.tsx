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
import { guestOrderEmail } from "@/lib/store/guest-cart";
import { AddressSelector } from "./address-selector";
import {
  EMPTY_GUEST_DETAILS,
  GuestAddressForm,
  GuestFormError,
  type GuestDetails,
  guestSummary,
  toGuestAddress,
  validateGuestDetails,
} from "./guest-address-form";
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

  const isGuest = authStatus !== "authenticated";

  const [guestDetails, setGuestDetails] =
    useState<GuestDetails>(EMPTY_GUEST_DETAILS);
  const [guestErrors, setGuestErrors] = useState<
    ReturnType<typeof validateGuestDetails>["fields"]
  >({});
  const [guestSubmitError, setGuestSubmitError] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] =
    useState<CheckoutPaymentMethod>("online");
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

  /*
   * No sign-in redirect. A guest has a cart of their own, so they check out here
   * with a typed address; the offer to create an account sits alongside, where it
   * can be taken up *after* the order rather than as a toll gate.
   */
  useEffect(() => {
    if (
      (authStatus === "authenticated" || authStatus === "unauthenticated") &&
      cartStatus === "idle"
    ) {
      void fetchCart();
    }
  }, [authStatus, cartStatus, fetchCart]);

  useEffect(() => {
    if (placedOrderId || authStatus === "idle" || authStatus === "loading") {
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

      return (
        list.find((address) => address.isDefault)?.id ?? list[0]?.id ?? null
      );
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
  const cartKey = cart
    ? `${cart.updatedAt ?? ""}:${cart.totals.total}:${cart.items.length}`
    : "";
  const codAllowed = options
    ? options.codAvailable &&
      (options.codMaxAmount === 0 || cartTotal <= options.codMaxAmount)
    : false;

  /**
   * The method actually used: if the preferred one is unavailable (COD switched off,
   * or the total exceeds its cap) and the other one works, use the other one. Derived
   * rather than written into state, so it cannot drift from `options`.
   */
  const method: CheckoutPaymentMethod =
    options && paymentMethod === "cod" && !codAllowed && options.onlineAvailable
      ? "online"
      : options &&
          paymentMethod === "online" &&
          !options.onlineAvailable &&
          codAllowed
        ? "cod"
        : paymentMethod;

  /**
   * A guest's address is only previewable once it would pass the same validation —
   * the form and the API agree on the rules, so this is not a guess.
   */
  const guestAddressReady = Boolean(
    !isGuest ||
    (guestDetails.email.trim() && !Object.values(guestErrors).some(Boolean)),
  );
  const addressKey = isGuest ? "guest" : (addressId ?? "");
  const previewKey = `${addressKey}|${method}|${cartKey}`;
  const canPreview =
    !isGuest && addressId
      ? Boolean(cart && cart.items.length > 0 && cart.unavailableCount === 0)
      : Boolean(
          isGuest &&
          guestAddressReady &&
          cart &&
          cart.items.length > 0 &&
          cart.unavailableCount === 0,
        );
  const preview =
    previewState && previewState.key === previewKey ? previewState.data : null;
  const previewError =
    previewState && previewState.key === previewKey ? previewState.error : null;
  const previewLoading =
    canPreview && (!previewState || previewState.key !== previewKey);

  useEffect(() => {
    if (!canPreview) {
      return;
    }

    const controller = new AbortController();
    const addressInput = isGuest
      ? { guestAddress: toGuestAddress(guestDetails.address) }
      : { addressId: addressId as string };

    checkoutApi
      .previewCheckout(
        { ...addressInput, paymentMethod: method },
        controller.signal,
      )
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
  }, [
    addressId,
    canPreview,
    isGuest,
    method,
    previewKey,
    guestDetails.address,
  ]);

  const selectedAddress =
    addresses.find((address) => address.id === addressId) ?? null;
  /**
   * "Step 1 is done" — an account's chosen address, or a guest's typed one. One
   * flag, so every button and progress marker below agrees with `place()`.
   */
  const hasAddress = isGuest ? guestAddressReady : Boolean(addressId);
  const totals = preview?.totals ?? cart?.totals ?? null;

  // -------------------------------------------------------------------- place

  const place = async () => {
    setGuestSubmitError(null);

    if (isGuest) {
      const { fields } = validateGuestDetails(guestDetails);

      if (Object.values(fields).some(Boolean)) {
        setGuestErrors(fields);
        setSection(1);
        setPlaceError(
          "Check the delivery details below — a few fields need fixing",
        );

        return;
      }
    } else if (!addressId) {
      setPlaceError("Choose a delivery address first");
      setSection(1);

      return;
    }

    setPlacing(true);
    setPlaceError(null);
    idempotencyKey.current ??= crypto.randomUUID();

    const addressInput = isGuest
      ? { guestAddress: toGuestAddress(guestDetails.address) }
      : { addressId: addressId as string };

    try {
      const placed = await checkoutApi.placeOrder({
        ...addressInput,
        ...(isGuest ? { guestEmail: guestDetails.email.trim() } : {}),
        paymentMethod: method,
        customerNote: notes.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      });

      setPlacedOrderId(placed.orderId);

      if (isGuest) {
        // Without this, a reload on the confirmation page would have no way to
        // identify the order — the guest has no token.
        guestOrderEmail.remember(placed.orderId, guestDetails.email.trim());
      }

      // The server already emptied it; this is what moves the header badge.
      void fetchCart();

      if (!placed.requiresPayment) {
        router.push(`/checkout/success?orderId=${placed.orderId}`);

        return;
      }

      if (!placed.payment) {
        setPlaceError(
          `Order ${placed.orderNumber} was created but no payment could be started. ${
            isGuest
              ? "Keep this page — we have also sent the order details to your email."
              : "Open it from “My orders” to pay."
          }`,
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
                `${getApiErrorMessage(error)} — order ${placed.orderNumber} is saved${isGuest ? "" : "; you can retry the payment from “My orders”"}.`,
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
        <p className="mt-3 text-sm font-medium text-rose-900">
          Checkout is unavailable
        </p>
        <p className="mt-1 text-xs text-rose-800">
          We could not load your cart. Please try again.
        </p>
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
    return <CheckoutSkeleton />;
  }

  const blockedByStock = cart.unavailableCount > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-bark-900">
            Checkout
          </h1>
          <p className="mt-0.5 text-sm text-bark-500">
            {cart.totals.itemCount}{" "}
            {cart.totals.itemCount === 1 ? "item" : "items"} ·{" "}
            {formatPrice(cart.totals.total, cart.totals.currency)}
          </p>
        </div>
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-xs font-medium text-bark-700 hover:text-bark-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Back to cart
        </Link>
      </div>

      <CheckoutProgress current={section} addressChosen={hasAddress} />

      {blockedByStock ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
            aria-hidden
          />
          <p className="text-xs text-rose-900">
            Some items are no longer available.{" "}
            <Link
              href="/cart"
              className="font-semibold underline-offset-2 hover:underline"
            >
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
        complete={hasAddress}
        summary={
          isGuest
            ? guestSummary(guestDetails)
            : selectedAddress
              ? `${selectedAddress.recipientName}, ${selectedAddress.city} ${selectedAddress.postalCode}`
              : "No address yet"
        }
        onOpen={() => setSection(1)}
      >
        {isGuest ? (
          <>
            <GuestAddressForm
              value={guestDetails}
              onChange={(next) => {
                setGuestDetails(next);
                setGuestErrors({});
                setGuestSubmitError(null);
              }}
              errors={guestErrors}
              disabled={placing}
            />

            {guestSubmitError ? (
              <GuestFormError message={guestSubmitError} />
            ) : null}

            <p className="mt-3 text-[11px] text-bark-500">
              Have an account?{" "}
              <Link
                href="/login?next=%2Fcheckout"
                className="font-medium text-bark-800 underline underline-offset-2 hover:text-bark-950"
              >
                Sign in
              </Link>{" "}
              and this cart comes with you.
            </p>
          </>
        ) : (
          <>
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
                disabled={!hasAddress || placing}
                onClick={() => {
                  if (isGuest) {
                    const { fields } = validateGuestDetails(guestDetails);

                    if (Object.values(fields).some(Boolean)) {
                      setGuestErrors(fields);
                      setGuestSubmitError(
                        "A couple of details still need fixing before we can price delivery",
                      );

                      return;
                    }

                    setGuestErrors({});
                    setGuestSubmitError(null);
                  }

                  setSection(2);
                }}
                className="rounded-lg bg-baby-400 px-3 py-2 text-xs font-semibold text-bark-950 hover:bg-baby-300 disabled:opacity-60"
              >
                Continue to payment
              </button>
            </div>
          </>
        )}
      </CheckoutSection>

      <CheckoutSection
        index={2}
        title="Payment method"
        icon={CreditCard}
        open={section === 2}
        complete={
          hasAddress &&
          (method === "online" ? Boolean(options?.onlineAvailable) : codAllowed)
        }
        summary={
          method === "cod"
            ? "Cash on delivery"
            : "Pay online (card / UPI / net banking)"
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
            className="rounded-lg border border-cream-300 px-3 py-2 text-xs font-medium text-bark-800 hover:bg-cream-100 disabled:opacity-60"
          >
            Back
          </button>
          <button
            type="button"
            disabled={placing || !hasAddress}
            onClick={() => setSection(3)}
            className="rounded-lg bg-baby-400 px-3 py-2 text-xs font-semibold text-bark-950 hover:bg-baby-300 disabled:opacity-60"
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
          totals
            ? `${formatPrice(totals.total, totals.currency)} payable`
            : "Not priced yet"
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
                onClick={() => setSection(hasAddress ? 2 : 1)}
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
            disabled={!hasAddress || blockedByStock}
            error={placeError}
          />
        ) : (
          <p className="text-xs text-bark-500">
            Choose an address and a payment method to see the final total.
          </p>
        )}

        {previewLoading && preview ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-bark-500">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Recalculating…
          </p>
        ) : null}
      </CheckoutSection>

      {/*
        On a phone the order total sat at the bottom of step three, so a shopper
        had to scroll past the form just to see what they would pay. This keeps
        the payable amount and the only way forward within thumb reach.
      */}
      <div
        className="sticky bottom-0 z-20 -mx-4 border-t border-cream-300 bg-cream-50/95 px-4 py-2.5 backdrop-blur sm:hidden"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.16em] text-bark-500 uppercase">
              Payable
            </p>
            <p className="text-sm font-semibold text-bark-950">
              {totals ? formatPrice(totals.total, totals.currency) : "—"}
            </p>
          </div>
          <button
            type="button"
            disabled={placing || blockedByStock}
            onClick={() => {
              if (section < 3) {
                setSection((current) => (current + 1) as Section);

                return;
              }

              void place();
            }}
            className="rounded-lg bg-baby-400 px-4 py-2 text-xs font-semibold text-bark-950 transition-colors hover:bg-baby-300 disabled:opacity-60"
          >
            {placing ? "Placing…" : section < 3 ? "Continue" : "Place order"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Three labelled beats. The old UI showed the step number inside each collapsible
 * section, which only helps once you have scrolled to it; this answers "how much
 * is left" at the top of the page, and each beat names the step rather than
 * leaving the shopper to infer what "2" means.
 */
function CheckoutProgress({
  current,
  addressChosen,
}: {
  current: Section;
  addressChosen: boolean;
}) {
  const steps = [
    { index: 1 as Section, label: "Address", done: addressChosen },
    {
      index: 2 as Section,
      label: "Payment",
      done: addressChosen && current > 2,
    },
    { index: 3 as Section, label: "Review", done: false },
  ];

  return (
    <ol
      className="flex items-center gap-1.5 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2.5"
      aria-label="Checkout progress"
    >
      {steps.map((step, position) => {
        const before = step.index < current;
        const active = step.index === current;

        return (
          <li
            key={step.index}
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                step.done || before
                  ? "bg-emerald-100 text-emerald-700"
                  : active
                    ? "bg-bark-900 text-cream-50"
                    : "bg-cream-300 text-bark-600",
              )}
              aria-current={active ? "step" : undefined}
            >
              {step.done || before ? "✓" : step.index}
            </span>
            <span
              className={cn(
                "truncate text-[11px] font-medium",
                active ? "text-bark-900" : "text-bark-500",
              )}
            >
              {step.label}
            </span>
            {position < steps.length - 1 ? (
              <span className="h-px min-w-2 flex-1 bg-cream-300" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
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
    <section className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cream-100"
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            complete
              ? "bg-emerald-100 text-emerald-700"
              : "bg-bark-900 text-cream-50",
          )}
        >
          {index}
        </span>
        <Icon className="h-4 w-4 shrink-0 text-bark-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-bark-900">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-bark-500">
            {summary}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-bark-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="border-t border-cream-200 p-4">{children}</div>
      ) : null}
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
