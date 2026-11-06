"use client";

import { CheckCircle2, Lock, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { Switch } from "@/components/admin/ui/switch";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { StoreSettings, UpdateSettingsPayload } from "@/types/settings";

const LOCALES = [
  { value: "en-IN", label: "English (India) — en-IN" },
  { value: "en-GB", label: "English (UK) — en-GB" },
  { value: "en-US", label: "English (US) — en-US" },
];

/** Money is edited in major units and stored in minor units, like every other form. */
const toMajor = (minorUnits: number) => (minorUnits / 100).toFixed(2);
const toMinor = (value: string) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.round(Math.max(parsed, 0) * 100) : 0;
};

interface Draft {
  storeName: string;
  legalName: string;
  supportEmail: string;
  supportPhone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  invoiceFooter: string;
  orderNote: string;
  currency: string;
  locale: string;
  taxRatePercent: string;
  flatShippingCharge: string;
  freeShippingThreshold: string;
  codEnabled: boolean;
  codMaxAmount: string;
}

function toDraft(settings: StoreSettings): Draft {
  return {
    storeName: settings.storeName,
    legalName: settings.legalName ?? "",
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    line1: settings.address.line1,
    line2: settings.address.line2 ?? "",
    city: settings.address.city,
    state: settings.address.state,
    postalCode: settings.address.postalCode,
    country: settings.address.country,
    invoiceFooter: settings.invoiceFooter ?? "",
    orderNote: settings.orderNote ?? "",
    currency: settings.currency,
    locale: settings.locale,
    taxRatePercent: String(settings.taxRatePercent),
    flatShippingCharge: toMajor(settings.flatShippingCharge),
    freeShippingThreshold: toMajor(settings.freeShippingThreshold),
    codEnabled: settings.codEnabled,
    codMaxAmount: settings.codMaxAmount > 0 ? toMajor(settings.codMaxAmount) : "",
  };
}

function toPayload(draft: Draft): UpdateSettingsPayload {
  return {
    storeName: draft.storeName.trim(),
    legalName: draft.legalName.trim(),
    supportEmail: draft.supportEmail.trim(),
    supportPhone: draft.supportPhone.trim(),
    address: {
      line1: draft.line1.trim(),
      line2: draft.line2.trim(),
      city: draft.city.trim(),
      state: draft.state.trim(),
      postalCode: draft.postalCode.trim(),
      country: draft.country.trim(),
    },
    invoiceFooter: draft.invoiceFooter.trim(),
    orderNote: draft.orderNote.trim(),
    currency: draft.currency.trim().toUpperCase(),
    locale: draft.locale,
    taxRatePercent: Number(draft.taxRatePercent),
    flatShippingCharge: toMinor(draft.flatShippingCharge),
    freeShippingThreshold: toMinor(draft.freeShippingThreshold),
    codEnabled: draft.codEnabled,
    codMaxAmount: draft.codMaxAmount.trim() ? toMinor(draft.codMaxAmount) : 0,
  };
}

/**
 * The settings editor.
 *
 * Everything an order or an invoice reads is here: identity, contact, address,
 * invoice footer, cash-on-delivery, and the pricing inputs. Currency is disabled
 * once the store holds products or orders — the API refuses it too, so a locked
 * field is a courtesy, not the rule.
 */
export function SettingsForm({
  settings,
  onSave,
}: {
  settings: StoreSettings;
  onSave: (payload: UpdateSettingsPayload) => Promise<unknown>;
}) {
  const baseline = useMemo(() => toDraft(settings), [settings]);
  const [draft, setDraft] = useState<Draft>(baseline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The parent remounts this form when the saved document changes (keyed on
  // `updatedAt`), so the draft never has to be synchronised inside an effect.
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSave(toPayload(draft));
      setSaved(true);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </div>
      ) : null}

      {saved ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Settings saved. New orders will use these values; existing orders keep the
          figures they were placed with.
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Store profile"
          description="Shown on the storefront, invoices and transactional email."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name" htmlFor="storeName">
            <Input
              id="storeName"
              value={draft.storeName}
              onChange={(event) => set("storeName", event.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field
            label="Legal entity"
            htmlFor="legalName"
            hint="Optional; printed above the address on invoices."
          >
            <Input
              id="legalName"
              value={draft.legalName}
              onChange={(event) => set("legalName", event.target.value)}
              maxLength={160}
            />
          </Field>
          <Field label="Support email" htmlFor="supportEmail">
            <Input
              id="supportEmail"
              type="email"
              value={draft.supportEmail}
              onChange={(event) => set("supportEmail", event.target.value)}
              required
            />
          </Field>
          <Field label="Support phone" htmlFor="supportPhone">
            <Input
              id="supportPhone"
              value={draft.supportPhone}
              onChange={(event) => set("supportPhone", event.target.value)}
              required
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Address"
          description="The registered address used on invoices and returns."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Street line 1" htmlFor="line1">
            <Input
              id="line1"
              value={draft.line1}
              onChange={(event) => set("line1", event.target.value)}
              required
            />
          </Field>
          <Field label="Street line 2" htmlFor="line2" hint="Optional">
            <Input
              id="line2"
              value={draft.line2}
              onChange={(event) => set("line2", event.target.value)}
            />
          </Field>
          <Field label="City" htmlFor="city">
            <Input
              id="city"
              value={draft.city}
              onChange={(event) => set("city", event.target.value)}
              required
            />
          </Field>
          <Field label="State" htmlFor="state">
            <Input
              id="state"
              value={draft.state}
              onChange={(event) => set("state", event.target.value)}
              required
            />
          </Field>
          <Field label="Postal code" htmlFor="postalCode">
            <Input
              id="postalCode"
              value={draft.postalCode}
              onChange={(event) => set("postalCode", event.target.value)}
              required
            />
          </Field>
          <Field label="Country" htmlFor="country">
            <Input
              id="country"
              value={draft.country}
              onChange={(event) => set("country", event.target.value)}
              required
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Pricing"
          description="Applied to new orders only — placed orders keep their own snapshot."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Currency"
            htmlFor="currency"
            hint={
              settings.currencyLocked
                ? "Locked: prices are stored as minor units of this currency, so it cannot change while products or orders exist."
                : "ISO 4217 code. Only changeable while the store is empty."
            }
          >
            <div className="relative">
              <Input
                id="currency"
                value={draft.currency}
                onChange={(event) => set("currency", event.target.value.toUpperCase())}
                disabled={settings.currencyLocked}
                maxLength={3}
                className="uppercase"
              />
              {settings.currencyLocked ? (
                <Lock
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
              ) : null}
            </div>
          </Field>
          <Field label="Locale" htmlFor="locale" hint="Formatting for money and dates.">
            <Select
              id="locale"
              value={draft.locale}
              onChange={(event) => set("locale", event.target.value)}
            >
              {LOCALES.some((option) => option.value === draft.locale) ? null : (
                <option value={draft.locale}>{draft.locale}</option>
              )}
              {LOCALES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Tax rate (%)"
            htmlFor="taxRatePercent"
            hint="Percentage added on top of the goods value at checkout."
          >
            <Input
              id="taxRatePercent"
              type="number"
              min={0}
              max={100}
              step={1}
              value={draft.taxRatePercent}
              onChange={(event) => set("taxRatePercent", event.target.value)}
            />
          </Field>
          <Field
            label={`Flat shipping fee (${settings.currency})`}
            htmlFor="flatShippingCharge"
            hint="Charged on orders below the free-shipping threshold."
          >
            <Input
              id="flatShippingCharge"
              type="number"
              min={0}
              step="0.01"
              value={draft.flatShippingCharge}
              onChange={(event) => set("flatShippingCharge", event.target.value)}
            />
          </Field>
          <Field
            label={`Free shipping from (${settings.currency})`}
            htmlFor="freeShippingThreshold"
            hint="Order value, after discounts, at which shipping becomes free."
          >
            <Input
              id="freeShippingThreshold"
              type="number"
              min={0}
              step="0.01"
              value={draft.freeShippingThreshold}
              onChange={(event) => set("freeShippingThreshold", event.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Checkout" description="How customers may pay, and what they read." />
        <CardBody className="space-y-4">
          <Switch
            id="codEnabled"
            checked={draft.codEnabled}
            onChange={(checked) => set("codEnabled", checked)}
            label="Allow cash on delivery"
            description="Turning this off hides the option and makes the API refuse COD checkouts."
          />
          <Field
            label={`Cash-on-delivery limit (${settings.currency})`}
            htmlFor="codMaxAmount"
            hint="Highest order total accepted with COD. Leave empty for no limit — checkout refuses anything above it."
          >
            <Input
              id="codMaxAmount"
              type="number"
              min={0}
              step="0.01"
              value={draft.codMaxAmount}
              onChange={(event) => set("codMaxAmount", event.target.value)}
              placeholder="No limit"
            />
          </Field>
          <Field
            label="Invoice footer"
            htmlFor="invoiceFooter"
            hint="Printed at the bottom of every invoice."
          >
            <Textarea
              id="invoiceFooter"
              value={draft.invoiceFooter}
              onChange={(event) => set("invoiceFooter", event.target.value)}
              maxLength={500}
              rows={2}
            />
          </Field>
          <Field
            label="Order note"
            htmlFor="orderNote"
            hint="Shown to the customer after checkout."
          >
            <Textarea
              id="orderNote"
              value={draft.orderNote}
              onChange={(event) => set("orderNote", event.target.value)}
              maxLength={300}
              rows={2}
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {settings.updatedBy
            ? `Last saved by ${settings.updatedBy} on ${new Date(settings.updatedAt).toLocaleString(settings.locale)}`
            : "Not saved since this store was set up."}
        </p>
        <div className="flex items-center gap-2">
          {dirty ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft(baseline)}
              disabled={saving}
            >
              Discard changes
            </Button>
          ) : null}
          <Button type="submit" disabled={!dirty || saving}>
            <Save className="mr-2 h-4 w-4" aria-hidden />
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </form>
  );
}
