// src/components/store/account/address-book.tsx

"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { AlertCircle, Loader2, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { addressService } from "@/services/store/address.service";
import { toast } from "@/store/toast.store";
import type { Address, AddressInput } from "@/types/address";

/**
 * The customer's address book.
 *
 * The API is the authority: it decides which address is the default (the first one
 * saved becomes default automatically) and it scopes every read and write to the
 * caller, so this screen never sends a customer id anywhere. After any mutation the
 * list is re-read instead of patched locally, which keeps the default badge honest.
 */

const PHONE_PATTERN = /^[\d+\-\s()]{6,20}$/;
const POSTAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,15}$/;

interface Draft {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

const EMPTY_DRAFT: Draft = {
  label: "",
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  isDefault: false,
};

function toDraft(address: Address): Draft {
  return {
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault,
  };
}

/** Mirrors the API's own rules, so a valid form is never rejected on submit. */
function validate(draft: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};

  if (draft.label.trim().length > 40) {
    errors.label = "Keep the label short (40 characters)";
  }

  if (draft.recipientName.trim().length < 2) {
    errors.recipientName = "Who will receive the parcel?";
  }

  if (!PHONE_PATTERN.test(draft.phone.trim())) {
    errors.phone = "A reachable number: 6–20 digits, spaces, + or -";
  }

  if (draft.line1.trim().length < 3) {
    errors.line1 = "House or building, street and area";
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

  if (draft.country.trim().length < 2) {
    errors.country = "Country is required";
  }

  return errors;
}

function toInput(draft: Draft): AddressInput {
  return {
    label: draft.label.trim() || undefined,
    recipientName: draft.recipientName.trim(),
    phone: draft.phone.trim(),
    line1: draft.line1.trim(),
    line2: draft.line2.trim() || undefined,
    city: draft.city.trim(),
    state: draft.state.trim(),
    postalCode: draft.postalCode.trim(),
    country: draft.country.trim(),
    isDefault: draft.isDefault,
  };
}

export function AddressBook() {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    key: string;
    addresses: Address[];
    error: string | null;
  }>({ key: "", addresses: [], error: null });

  /** `undefined` = form closed, `null` = adding, a string = editing that address. */
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  /*
   * The list is keyed by a reload token rather than patched after every mutation:
   * the server owns which address is the default, so re-reading is the only way to
   * keep that badge honest. `loading` is derived, not stored, so the effect never
   * sets state synchronously.
   */
  const queryKey = `addresses|${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    addressService
      .list(controller.signal)
      .then((list) => {
        if (active) {
          setState({ key: queryKey, addresses: list, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState((previous) => ({
          ...previous,
          key: queryKey,
          error: getApiErrorMessage(error),
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [queryKey]);

  const addresses = state.addresses;
  const loading = state.key !== queryKey;
  const failed = !loading && state.error !== null;

  // Opening the form puts the cursor where the typing starts.
  useEffect(() => {
    if (editingId !== undefined) {
      firstFieldRef.current?.focus();
    }
  }, [editingId]);

  const openCreate = () => {
    setDraft({ ...EMPTY_DRAFT, isDefault: addresses.length === 0 });
    setErrors({});
    setFormError(null);
    setEditingId(null);
  };

  const openEdit = (address: Address) => {
    setDraft(toDraft(address));
    setErrors({});
    setFormError(null);
    setEditingId(address.id);
  };

  const closeForm = () => {
    setEditingId(undefined);
    setErrors({});
    setFormError(null);
  };

  const update = (field: keyof Draft, value: string | boolean) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate(draft);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError("Check the highlighted fields before saving.");

      // Move focus to the first problem, so a keyboard user is not left at the button.
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();

      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingId) {
        await addressService.update(editingId, toInput(draft));
        toast.success("Address updated");
      } else {
        await addressService.create(toInput(draft));
        toast.success("Address saved");
      }

      closeForm();
      setReloadToken((token) => token + 1);
    } catch (error) {
      setFormError(getApiErrorMessage(error));
      setSaving(false);

      return;
    }

    setSaving(false);
  };

  const makeDefault = async (address: Address) => {
    setBusyId(address.id);

    try {
      await addressService.update(address.id, { isDefault: true });
      setReloadToken((token) => token + 1);
      toast.success("Default address updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (address: Address) => {
    setBusyId(address.id);

    try {
      await addressService.remove(address.id);
      setConfirmDeleteId(null);
      setReloadToken((token) => token + 1);
      toast.success("Address removed");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-bark-500">
          {addresses.length > 0
            ? `${addresses.length} saved ${addresses.length === 1 ? "address" : "addresses"}`
            : "Deliveries go to the address you pick at checkout."}
        </p>
        {editingId === undefined ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-baby-400 px-3.5 py-2 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add address
          </button>
        ) : null}
      </div>

      {editingId !== undefined ? (
        <form
          ref={formRef}
          onSubmit={(event) => void submit(event)}
          className="surface space-y-4 p-5"
          noValidate
        >
          <h2 className="font-display text-lg text-bark-950">
            {editingId ? "Edit address" : "New address"}
          </h2>

          {formError ? (
            <p
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="flex items-start gap-2 rounded-control border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {formError}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              ref={firstFieldRef}
              label="Label"
              value={draft.label}
              onChange={(value) => update("label", value)}
              placeholder="Home, Office…"
              error={errors.label}
              autoComplete="off"
            />
            <Field
              label="Recipient name"
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
              placeholder="+91 98765 43210"
              error={errors.phone}
              autoComplete="tel"
              required
            />
            <Field
              label="Country"
              value={draft.country}
              onChange={(value) => update("country", value)}
              error={errors.country}
              autoComplete="country-name"
              required
            />
            <Field
              label="Address line 1"
              value={draft.line1}
              onChange={(value) => update("line1", value)}
              placeholder="House, street, area"
              error={errors.line1}
              autoComplete="address-line1"
              required
              className="sm:col-span-2"
            />
            <Field
              label="Address line 2"
              value={draft.line2}
              onChange={(value) => update("line2", value)}
              placeholder="Landmark, apartment (optional)"
              error={errors.line2}
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
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-xs text-bark-700">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(event) => update("isDefault", event.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-bark-900"
            />
            Use this as my default delivery address
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-baby-400 px-4 py-2 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {saving ? "Saving…" : editingId ? "Save changes" : "Save address"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="inline-flex cursor-pointer items-center rounded-control border border-bark-300 px-4 py-2 text-sm font-medium text-bark-800 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading && addresses.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
          {[0, 1].map((key) => (
            <div key={key} className="h-40 animate-pulse rounded-surface bg-cream-200" />
          ))}
        </div>
      ) : null}

      {failed ? (
        <div
          role="alert"
          className="surface flex flex-col items-start gap-2 p-5 text-sm text-bark-700"
        >
          <p className="flex items-center gap-2 font-medium text-rose-700">
            <AlertCircle className="h-4 w-4" aria-hidden />
            We could not load your addresses
          </p>
          <p className="text-xs text-bark-500">{state.error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mt-1 cursor-pointer rounded-control border border-bark-300 px-3 py-1.5 text-xs font-medium text-bark-900 hover:bg-cream-100"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!loading && !failed && addresses.length === 0 ? (
        <div className="surface flex flex-col items-center px-6 py-12 text-center">
          <MapPin className="h-6 w-6 text-bark-300" aria-hidden />
          <p className="mt-3 text-sm font-medium text-bark-900">No addresses saved yet</p>
          <p className="mt-1 max-w-sm text-xs text-bark-500">
            Save one here and checkout will fill itself in — the first address becomes your
            default.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-baby-400 px-4 py-2 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add your first address
          </button>
        </div>
      ) : null}

      {addresses.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => {
            const busy = busyId === address.id;
            const confirming = confirmDeleteId === address.id;

            return (
              <li
                key={address.id}
                className={cn(
                  "surface flex flex-col p-4",
                  address.isDefault && "border-bark-400",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-bark-900">
                        {address.label || "Address"}
                      </span>
                      {address.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-bark-300 bg-cream-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-bark-800 uppercase">
                          <Star className="h-2.5 w-2.5 fill-bark-700 text-bark-700" aria-hidden />
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1.5 text-xs text-bark-700">{address.recipientName}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-bark-500">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}
                      <br />
                      {address.city}, {address.state} {address.postalCode}
                      <br />
                      {address.country}
                    </p>
                    <p className="mt-1 text-xs text-bark-500">{address.phone}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cream-300 pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(address)}
                    disabled={busy}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-cream-300 px-2.5 py-1.5 text-[11px] font-medium text-bark-800 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    Edit
                  </button>

                  {!address.isDefault ? (
                    <button
                      type="button"
                      onClick={() => void makeDefault(address)}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-cream-300 px-2.5 py-1.5 text-[11px] font-medium text-bark-800 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <Star className="h-3 w-3" aria-hidden />
                      )}
                      Make default
                    </button>
                  ) : null}

                  {confirming ? (
                    <span className="flex items-center gap-1.5" aria-live="polite">
                      <button
                        type="button"
                        onClick={() => void remove(address)}
                        disabled={busy}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-control bg-rose-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                        Delete it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="cursor-pointer rounded-control px-2 py-1.5 text-[11px] font-medium text-bark-700 hover:bg-cream-100"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(address.id)}
                      disabled={busy}
                      className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-control px-2.5 py-1.5 text-[11px] font-medium text-bark-600 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
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
  ref,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  // A field error is both announced and described, never a red border alone.
  const errorId = useId();

  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-medium text-bark-700">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-10 w-full rounded-control border bg-cream-50 px-3 text-sm text-bark-900 placeholder:text-bark-400 focus:outline-none focus:ring-2 focus:ring-baby-300",
          error ? "border-rose-300" : "border-cream-300 focus:border-bark-400",
        )}
        required={required}
      />
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-[11px] text-rose-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
