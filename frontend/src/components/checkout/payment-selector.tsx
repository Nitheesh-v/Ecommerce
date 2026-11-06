"use client";

// src/components/checkout/payment-selector.tsx

/**
 * Step 2 of checkout: pay now or at the door.
 *
 * The rules shown here mirror the server exactly — COD can be switched off, and it
 * can be capped at an amount — but they are only *shown* here. `POST /checkout/place`
 * enforces both again, so a disabled card is a courtesy, not the control.
 */
import { Banknote, Check, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/components/ui/format-currency";
import type { CheckoutPaymentMethod, CheckoutPaymentOptions } from "@/types/cart";

export function PaymentSelector({
  value,
  onChange,
  options,
  total,
  disabled = false,
}: {
  value: CheckoutPaymentMethod;
  onChange: (method: CheckoutPaymentMethod) => void;
  options: CheckoutPaymentOptions;
  /** Order total, minor units — compared against the COD cap. */
  total: number;
  disabled?: boolean;
}) {
  const codOverLimit = options.codMaxAmount > 0 && total > options.codMaxAmount;
  const codReason = !options.codAvailable
    ? "Currently unavailable"
    : codOverLimit
      ? `Available on orders up to ${formatPrice(options.codMaxAmount, options.currency)}`
      : null;

  return (
    <div className="space-y-2">
      <PaymentCard
        method="online"
        title="Pay online"
        description="Card, UPI, net banking or wallet — handled by Razorpay's secure checkout."
        icon={CreditCard}
        selected={value === "online"}
        available={options.onlineAvailable}
        unavailableReason={
          options.onlineAvailable ? null : "Online payment is temporarily unavailable"
        }
        disabled={disabled}
        onSelect={onChange}
      />
      <PaymentCard
        method="cod"
        title="Cash on delivery"
        description="Pay the courier when the parcel arrives."
        icon={Banknote}
        selected={value === "cod"}
        available={options.codAvailable && !codOverLimit}
        unavailableReason={codReason}
        disabled={disabled}
        onSelect={onChange}
      />

      {options.onlineAvailable ? (
        <p className="text-[11px] text-slate-500">
          Payments are confirmed by the gateway — an order is only marked paid after the
          server verifies it.
        </p>
      ) : null}
    </div>
  );
}

function PaymentCard({
  method,
  title,
  description,
  icon: Icon,
  selected,
  available,
  unavailableReason,
  disabled,
  onSelect,
}: {
  method: CheckoutPaymentMethod;
  title: string;
  description: string;
  icon: typeof CreditCard;
  selected: boolean;
  available: boolean;
  unavailableReason: string | null;
  disabled: boolean;
  onSelect: (method: CheckoutPaymentMethod) => void;
}) {
  const blocked = !available || disabled;

  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
        selected && available
          ? "border-slate-900 bg-slate-50"
          : "border-slate-200 bg-white",
        blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-slate-300",
      )}
    >
      <input
        type="radio"
        name="payment-method"
        value={method}
        checked={selected}
        disabled={blocked}
        onChange={() => onSelect(method)}
        className="sr-only"
      />
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected && available
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300",
        )}
        aria-hidden
      >
        {selected && available ? <Check className="h-3 w-3" /> : null}
      </span>

      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-600">{description}</span>
        {unavailableReason ? (
          <span className="mt-1 block text-[11px] font-medium text-rose-600">
            {unavailableReason}
          </span>
        ) : null}
      </span>
    </label>
  );
}
