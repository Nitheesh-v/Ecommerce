"use client";

// src/components/checkout/address-selector.tsx

/**
 * Step 1 of checkout: pick where the parcel goes.
 *
 * Addresses come from the customer's own address book; the server checks ownership
 * again when the order is placed, so selecting an id here grants nothing. The
 * "Add new address" form posts to `/api/addresses` and selects what comes back.
 */
import { useState, type FormEvent } from "react";
import { Check, Loader2, MapPin, Plus, X } from "lucide-react";
import { Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { addressService } from "@/services/store/address.service";
import type { Address, AddressInput } from "@/types/address";

interface DraftAddress {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const EMPTY_DRAFT: DraftAddress = {
  label: "Home",
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

const PHONE_PATTERN = /^[\d+\-\s()]{6,20}$/;
const POSTAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,15}$/;

function validate(draft: DraftAddress): Partial<Record<keyof DraftAddress, string>> {
  const errors: Partial<Record<keyof DraftAddress, string>> = {};

  if (draft.recipientName.trim().length < 2) {
    errors.recipientName = "Tell us who will receive the parcel";
  }
  if (!PHONE_PATTERN.test(draft.phone.trim())) {
    errors.phone = "Enter a reachable phone number (6–20 digits)";
  }
  if (draft.line1.trim().length < 3) {
    errors.line1 = "Street address is required";
  }
  if (draft.city.trim().length < 2) {
    errors.city = "City is required";
  }
  if (draft.state.trim().length < 2) {
    errors.state = "State is required";
  }
  if (!POSTAL_PATTERN.test(draft.postalCode.trim())) {
    errors.postalCode = "Enter a valid postal code";
  }

  return errors;
}

export function AddressSelector({
  addresses,
  selectedId,
  onSelect,
  onCreated,
  loading = false,
  disabled = false,
}: {
  addresses: Address[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (address: Address) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(addresses.length === 0);
  const [draft, setDraft] = useState<DraftAddress>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<keyof DraftAddress, string>>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const update = (field: keyof DraftAddress, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const found = validate(draft);

    if (Object.values(found).some(Boolean)) {
      setErrors(found);

      return;
    }

    const input: AddressInput = {
      label: draft.label.trim() || "Home",
      recipientName: draft.recipientName.trim(),
      phone: draft.phone.trim(),
      line1: draft.line1.trim(),
      line2: draft.line2.trim() || undefined,
      city: draft.city.trim(),
      state: draft.state.trim(),
      postalCode: draft.postalCode.trim(),
      country: draft.country.trim() || "India",
    };

    setSaving(true);

    try {
      const created = await addressService.create(input);

      onCreated(created);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
    } catch (error) {
      setFormError(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {addresses.map((address) => {
        const selected = address.id === selectedId;

        return (
          <label
            key={address.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
              selected
                ? "border-slate-900 bg-slate-50"
                : "border-slate-200 bg-white hover:border-slate-300",
              (disabled || saving) && "pointer-events-none opacity-70",
            )}
          >
            <input
              type="radio"
              name="shipping-address"
              value={address.id}
              checked={selected}
              onChange={() => onSelect(address.id)}
              disabled={disabled}
              className="sr-only"
            />
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300",
              )}
              aria-hidden
            >
              {selected ? <Check className="h-3 w-3" /> : null}
            </span>

            <span className="min-w-0 flex-1 text-xs">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-900">
                  {address.recipientName}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-500 uppercase">
                  {address.label}
                </span>
                {address.isDefault ? (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    Default
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block leading-relaxed text-slate-600">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}, {address.city},{" "}
                {address.state} {address.postalCode}, {address.country}
              </span>
              <span className="mt-1 block text-slate-500">{address.phone}</span>
            </span>
          </label>
        );
      })}

      {adding ? (
        <form
          onSubmit={(event) => void submit(event)}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-3"
        >
          <div className="flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-slate-400" aria-hidden />
              New delivery address
            </p>
            {addresses.length > 0 ? (
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cancel adding an address"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="Full name"
              value={draft.recipientName}
              onChange={(value) => update("recipientName", value)}
              error={errors.recipientName}
              autoComplete="name"
              required
            />
            <Field
              label="Phone"
              value={draft.phone}
              onChange={(value) => update("phone", value)}
              error={errors.phone}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              required
            />
            <Field
              label="Street address"
              value={draft.line1}
              onChange={(value) => update("line1", value)}
              error={errors.line1}
              autoComplete="address-line1"
              className="sm:col-span-2"
              required
            />
            <Field
              label="Landmark / apartment (optional)"
              value={draft.line2}
              onChange={(value) => update("line2", value)}
              autoComplete="address-line2"
              className="sm:col-span-2"
            />
            <Field
              label="City"
              value={draft.city}
              onChange={(value) => update("city", value)}
              error={errors.city}
              autoComplete="address-level2"
              required
            />
            <Field
              label="State"
              value={draft.state}
              onChange={(value) => update("state", value)}
              error={errors.state}
              autoComplete="address-level1"
              required
            />
            <Field
              label="Postal code"
              value={draft.postalCode}
              onChange={(value) => update("postalCode", value)}
              error={errors.postalCode}
              autoComplete="postal-code"
              required
            />
            <Field
              label="Country"
              value={draft.country}
              onChange={(value) => update("country", value)}
              autoComplete="country-name"
            />
            <Field
              label="Label (Home, Work…)"
              value={draft.label}
              onChange={(value) => update("label", value)}
              className="sm:col-span-2"
            />
          </div>

          {formError ? (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {saving ? "Saving…" : "Save address"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add new address
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
  className,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-medium text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-9 w-full rounded-lg border bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10",
          error ? "border-rose-300" : "border-slate-200 focus:border-slate-400",
        )}
        required={required}
      />
      {error ? <span className="mt-1 block text-[11px] text-rose-600">{error}</span> : null}
    </label>
  );
}
