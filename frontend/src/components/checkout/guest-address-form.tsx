"use client";

// src/components/checkout/guest-address-form.tsx

/**
 * Step 1 of checkout for a shopper with no account.
 *
 * A guest has no address book, so the address is typed here — and an email is
 * collected at the same time, because it is the only way to send them a
 * confirmation or find their order later. Both are plain inputs rather than a
 * "create an account" detour: the whole point of guest checkout is that the
 * shopper decides when (or whether) to sign up.
 *
 * Validation reuses the address book's own rules (`validate`/`DraftAddress` from
 * `address-selector`), so a form that passes here can never be rejected by the API
 * for the same field, and the server enforces them regardless.
 */
import { useId, type FormEvent } from "react";
import { AlertTriangle, Mail, MapPin, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type DraftAddress,
  toGuestAddress,
  validate,
} from "./address-selector";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface GuestDetails {
  address: DraftAddress;
  email: string;
}

export const EMPTY_GUEST_DETAILS: GuestDetails = {
  address: {
    label: "Home",
    recipientName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
  },
  email: "",
};

/** Field-level checks, mirroring the API's DTO so nothing fails only after submit. */
export function validateGuestDetails(details: GuestDetails): {
  fields: Partial<Record<keyof DraftAddress | "email", string>>;
} {
  const fields: Partial<Record<keyof DraftAddress | "email", string>> = {
    ...validate(details.address),
  };

  if (!EMAIL_PATTERN.test(details.email.trim())) {
    fields.email = "We need an email to send your confirmation";
  }

  return { fields };
}

/**
 * One labelled field with its error/hint.
 *
 * Declared at module scope, not inside the form: a component created during render
 * is a new type on every pass, so React would unmount and remount its input on each
 * keystroke and the shopper would lose focus mid-address.
 */
function GuestField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-bark-700">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-[11px] text-rose-600"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-bark-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function GuestAddressForm({
  value,
  onChange,
  errors,
  disabled = false,
  onBlurField,
}: {
  value: GuestDetails;
  onChange: (next: GuestDetails) => void;
  errors: Partial<Record<keyof DraftAddress | "email", string>>;
  disabled?: boolean;
  /** Lets the parent move focus to the first invalid field after a failed submit. */
  onBlurField?: (field: string) => void;
}) {
  const id = useId();

  const fieldId = (name: string) => `${id}-${name}`;

  const update = (field: keyof DraftAddress, next: string) =>
    onChange({ ...value, address: { ...value.address, [field]: next } });

  const inputClass = (name: string) =>
    cn(
      "w-full rounded-lg border bg-cream-50 px-3 py-2 text-sm text-bark-900 placeholder:text-bark-400",
      "transition-colors focus:outline-none focus:ring-2 focus:ring-baby-300",
      errors[name as keyof typeof errors]
        ? "border-rose-400"
        : "border-cream-300 focus:border-bark-300",
    );

  const errorFor = (name: keyof DraftAddress | "email") =>
    errors[name]
      ? { "aria-invalid": true, "aria-describedby": `${fieldId(name)}-error` }
      : {};

  return (
    <form
      className="space-y-3"
      onSubmit={(event: FormEvent) => event.preventDefault()}
      noValidate
    >
      <p className="flex items-start gap-2 rounded-lg bg-cream-100 px-3 py-2 text-[11px] leading-relaxed text-bark-600">
        <Truck
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bark-400"
          aria-hidden
        />
        No account needed. We use these details for delivery only, and the email
        for your confirmation.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <GuestField
          id={fieldId("recipientName")}
          label="Full name"
          error={errors["recipientName"]}
        >
          <input
            id={fieldId("recipientName")}
            className={inputClass("recipientName")}
            autoComplete="name"
            value={value.address.recipientName}
            onChange={(event) => update("recipientName", event.target.value)}
            onBlur={() => onBlurField?.("recipientName")}
            disabled={disabled}
            {...errorFor("recipientName")}
          />
        </GuestField>

        <GuestField id={fieldId("phone")} label="Phone" error={errors["phone"]}>
          <input
            id={fieldId("phone")}
            className={inputClass("phone")}
            autoComplete="tel"
            placeholder="+91 98765 43210"
            value={value.address.phone}
            onChange={(event) => update("phone", event.target.value)}
            onBlur={() => onBlurField?.("phone")}
            disabled={disabled}
            {...errorFor("phone")}
          />
        </GuestField>
      </div>

      <GuestField
        id={fieldId("line1")}
        label="Street address"
        error={errors["line1"]}
      >
        <input
          id={fieldId("line1")}
          className={inputClass("line1")}
          autoComplete="address-line1"
          placeholder="House / flat, street"
          value={value.address.line1}
          onChange={(event) => update("line1", event.target.value)}
          onBlur={() => onBlurField?.("line1")}
          disabled={disabled}
          {...errorFor("line1")}
        />
      </GuestField>

      <GuestField
        id={fieldId("line2")}
        label="Landmark or area (optional)"
        error={errors["line2"]}
      >
        <input
          id={fieldId("line2")}
          className={inputClass("line2")}
          autoComplete="address-line2"
          value={value.address.line2}
          onChange={(event) => update("line2", event.target.value)}
          disabled={disabled}
        />
      </GuestField>

      <div className="grid gap-3 sm:grid-cols-3">
        <GuestField id={fieldId("city")} label="City" error={errors["city"]}>
          <input
            id={fieldId("city")}
            className={inputClass("city")}
            autoComplete="address-level2"
            value={value.address.city}
            onChange={(event) => update("city", event.target.value)}
            onBlur={() => onBlurField?.("city")}
            disabled={disabled}
            {...errorFor("city")}
          />
        </GuestField>

        <GuestField id={fieldId("state")} label="State" error={errors["state"]}>
          <input
            id={fieldId("state")}
            className={inputClass("state")}
            autoComplete="address-level1"
            value={value.address.state}
            onChange={(event) => update("state", event.target.value)}
            onBlur={() => onBlurField?.("state")}
            disabled={disabled}
            {...errorFor("state")}
          />
        </GuestField>

        <GuestField
          id={fieldId("postalCode")}
          label="PIN code"
          error={errors["postalCode"]}
        >
          <input
            id={fieldId("postalCode")}
            className={inputClass("postalCode")}
            autoComplete="postal-code"
            inputMode="numeric"
            value={value.address.postalCode}
            onChange={(event) => update("postalCode", event.target.value)}
            onBlur={() => onBlurField?.("postalCode")}
            disabled={disabled}
            {...errorFor("postalCode")}
          />
        </GuestField>
      </div>

      <GuestField
        id={fieldId("email")}
        label="Email for your confirmation"
        error={errors["email"]}
        hint="Order updates and the invoice go here. No newsletter."
      >
        <div className="relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-bark-400"
            aria-hidden
          />
          <input
            id={fieldId("email")}
            type="email"
            className={cn(inputClass("email"), "pl-9")}
            autoComplete="email"
            placeholder="you@example.com"
            value={value.email}
            onChange={(event) =>
              onChange({ ...value, email: event.target.value })
            }
            onBlur={() => onBlurField?.("email")}
            disabled={disabled}
            {...errorFor("email")}
          />
        </div>
      </GuestField>
    </form>
  );
}

/** Re-exported so the checkout view imports one module, not two. */
export { toGuestAddress };

/** A tiny summary line for the collapsed step header. */
export function guestSummary(details: GuestDetails): string {
  const { city, recipientName, postalCode } = details.address;

  return recipientName.trim()
    ? `${recipientName}, ${city} ${postalCode}`.trim()
    : "No address yet";
}

/** Icon kept next to the form's identity for scanability. */
export const GuestIcon = MapPin;

/** Shown when the guest form could not be submitted for a non-field reason. */
export function GuestFormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
