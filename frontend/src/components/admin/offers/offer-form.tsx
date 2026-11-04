"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { Switch } from "@/components/admin/ui/switch";
import { getApiErrorMessage } from "@/lib/api/errors";
import { productsService } from "@/services/admin/products.service";
import { categoriesService } from "@/services/admin/categories.service";
import { offersService } from "@/services/admin/coupons.service";
import { toast } from "@/store/toast.store";
import type { DiscountType, OfferDetail, OfferWritePayload } from "@/types/offer";
import { EntityPicker, type PickerOption } from "./entity-picker";

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;

interface FormValues {
  name: string;
  description: string;
  code: string;
  type: DiscountType;
  /** Percentage points, or rupees for a fixed amount. */
  value: string;
  minCartValue: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  totalUsageLimit: string;
  perCustomerLimit: string;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  excludedProductIds: string[];
  excludedCategoryIds: string[];
  customerVisible: boolean;
  isActive: boolean;
}

type Errors = Partial<Record<keyof FormValues, string>>;

/** ISO instant → the `YYYY-MM-DDTHH:mm` an `<input type="datetime-local">` wants. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function defaultWindow() {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86_400_000);

  return { startsAt: toLocalInput(now.toISOString()), endsAt: toLocalInput(end.toISOString()) };
}

function toMinor(rupees: string): number {
  const value = Number(rupees.replace(/[,\s]/g, ""));

  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

function toRupeesInput(minor: number | null): string {
  return minor === null || minor === 0 ? "" : (minor / 100).toString();
}

function emptyValues(): FormValues {
  return {
    name: "",
    description: "",
    code: "",
    type: "percentage",
    value: "10",
    minCartValue: "",
    maxDiscount: "",
    ...defaultWindow(),
    totalUsageLimit: "",
    perCustomerLimit: "1",
    applicableProductIds: [],
    applicableCategoryIds: [],
    excludedProductIds: [],
    excludedCategoryIds: [],
    customerVisible: true,
    isActive: true,
  };
}

/** The stored offer expressed as editable strings. */
function valuesFrom(offer: OfferDetail): FormValues {
  return {
    name: offer.name,
    description: offer.description ?? "",
    code: offer.code,
    type: offer.type,
    value:
      offer.type === "percentage"
        ? String(offer.value)
        : offer.type === "fixed"
          ? toRupeesInput(offer.value)
          : "",
    minCartValue: toRupeesInput(offer.minCartValue),
    maxDiscount: toRupeesInput(offer.maxDiscount),
    startsAt: toLocalInput(offer.startsAt),
    endsAt: toLocalInput(offer.endsAt),
    totalUsageLimit: offer.totalUsageLimit === null ? "" : String(offer.totalUsageLimit),
    perCustomerLimit: String(offer.perCustomerLimit),
    applicableProductIds: offer.applicableProductIds,
    applicableCategoryIds: offer.applicableCategoryIds,
    excludedProductIds: offer.excludedProductIds,
    excludedCategoryIds: offer.excludedCategoryIds,
    customerVisible: offer.customerVisible,
    isActive: offer.isActive,
  };
}

/**
 * Offer editor used by both `/admin/offers/create` and `/admin/offers/[id]/edit`.
 *
 * The client rules mirror the API's so the admin sees a problem before a round
 * trip, but the API re-validates everything (and owns code uniqueness, which a
 * browser cannot know).
 */
export function OfferForm({
  offer,
  onSaved,
}: {
  offer: OfferDetail | null;
  onSaved: (saved: OfferDetail) => void;
}) {
  const [values, setValues] = useState<FormValues>(() =>
    offer ? valuesFrom(offer) : emptyValues(),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [productOptions, setProductOptions] = useState<PickerOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<PickerOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([productsService.listAll(), categoriesService.listAll()])
      .then(([products, categories]) => {
        if (!active) {
          return;
        }

        setProductOptions(
          products.map((product) => ({
            id: product.id,
            name: product.name,
            hint: `${product.category?.name ?? "Uncategorised"} · ${product.sku}`,
          })),
        );
        setCategoryOptions(
          categories.map((category) => ({ id: category.id, name: category.name })),
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setOptionsError(getApiErrorMessage(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const conflicts = useMemo(() => {
    const bothProducts = values.applicableProductIds.filter((id) =>
      values.excludedProductIds.includes(id),
    );
    const bothCategories = values.applicableCategoryIds.filter((id) =>
      values.excludedCategoryIds.includes(id),
    );

    return { bothProducts, bothCategories };
  }, [values]);

  const validate = (): Errors => {
    const next: Errors = {};

    if (values.name.trim().length < 3) {
      next.name = "Give the offer a name of at least 3 characters";
    }
    if (!CODE_PATTERN.test(values.code.trim())) {
      next.code = "3–32 letters, digits, hyphen or underscore (no spaces)";
    }

    if (values.type === "percentage") {
      const percent = Number(values.value);

      if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        next.value = "A percentage must be a whole number between 1 and 100";
      }
      if (values.maxDiscount.trim() !== "" && !(toMinor(values.maxDiscount) > 0)) {
        next.maxDiscount = "Enter a cap greater than zero, or leave it empty";
      }
    } else if (values.type === "fixed") {
      if (!(toMinor(values.value) > 0)) {
        next.value = "Enter a discount greater than zero";
      }
      if (values.maxDiscount.trim() !== "") {
        next.maxDiscount = "Only a percentage offer can have a maximum discount";
      }
    }

    if (values.minCartValue.trim() !== "" && toMinor(values.minCartValue) < 0) {
      next.minCartValue = "Minimum cart value cannot be negative";
    }

    const startsAt = fromLocalInput(values.startsAt);
    const endsAt = fromLocalInput(values.endsAt);

    if (!startsAt) {
      next.startsAt = "Pick a start date and time";
    }
    if (!endsAt) {
      next.endsAt = "Pick an expiry date and time";
    } else if (startsAt && new Date(startsAt) >= new Date(endsAt)) {
      next.endsAt = "The expiry must come after the start";
    }

    if (values.totalUsageLimit.trim() !== "") {
      const limit = Number(values.totalUsageLimit);

      if (!Number.isInteger(limit) || limit < 1) {
        next.totalUsageLimit = "Leave empty for unlimited, or enter 1 or more";
      }
    }

    const perCustomer = Number(values.perCustomerLimit);

    if (!Number.isInteger(perCustomer) || perCustomer < 1) {
      next.perCustomerLimit = "At least 1 use per customer";
    } else if (
      values.totalUsageLimit.trim() !== "" &&
      Number.isInteger(Number(values.totalUsageLimit)) &&
      perCustomer > Number(values.totalUsageLimit)
    ) {
      next.perCustomerLimit = "The per-customer limit cannot exceed the total limit";
    }

    if (conflicts.bothProducts.length > 0) {
      next.excludedProductIds = "A product cannot be both included and excluded";
    }
    if (conflicts.bothCategories.length > 0) {
      next.excludedCategoryIds = "A category cannot be both included and excluded";
    }

    return next;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const found = validate();

    if (Object.keys(found).length > 0) {
      setErrors(found);

      return;
    }

    const payload: OfferWritePayload = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      code: values.code.trim(),
      type: values.type,
      value:
        values.type === "percentage"
          ? Number(values.value)
          : values.type === "fixed"
            ? toMinor(values.value)
            : 0,
      minCartValue: values.minCartValue.trim() ? toMinor(values.minCartValue) : 0,
      startsAt: fromLocalInput(values.startsAt),
      endsAt: fromLocalInput(values.endsAt),
      perCustomerLimit: Number(values.perCustomerLimit),
      applicableProductIds: values.applicableProductIds,
      applicableCategoryIds: values.applicableCategoryIds,
      excludedProductIds: values.excludedProductIds,
      excludedCategoryIds: values.excludedCategoryIds,
      customerVisible: values.customerVisible,
      isActive: values.isActive,
      ...(values.type === "percentage" && values.maxDiscount.trim()
        ? { maxDiscount: toMinor(values.maxDiscount) }
        : {}),
      ...(values.totalUsageLimit.trim()
        ? { totalUsageLimit: Number(values.totalUsageLimit) }
        : {}),
    };

    setSaving(true);

    try {
      const saved = offer
        ? await offersService.update(offer.id, payload)
        : await offersService.create(payload);

      toast.success(offer ? `“${saved.name}” updated` : `“${saved.name}” created`);
      onSaved(saved);
    } catch (error_) {
      setFormError(getApiErrorMessage(error_));
    } finally {
      setSaving(false);
    }
  };

  const isPercentage = values.type === "percentage";
  const isFixed = values.type === "fixed";

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      {formError ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {formError}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Offer details"
          description="What the customer sees and the code they type at checkout."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Offer name" htmlFor="offer-name" error={errors.name}>
            <Input
              id="offer-name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Diwali 20% off"
              invalid={Boolean(errors.name)}
              maxLength={120}
            />
          </Field>

          <Field
            label="Coupon code"
            htmlFor="offer-code"
            error={errors.code}
            hint="Stored upper-cased; matching is case-insensitive."
          >
            <Input
              id="offer-code"
              value={values.code}
              onChange={(event) => set("code", event.target.value.toUpperCase())}
              placeholder="DIWALI20"
              invalid={Boolean(errors.code)}
              maxLength={32}
              className="font-mono tracking-wide"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Description"
              htmlFor="offer-description"
              hint="Shown on the /offers page."
            >
              <Textarea
                id="offer-description"
                value={values.description}
                onChange={(event) => set("description", event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Celebrate the season with 20% off everything."
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Discount"
          description="The API computes the final amount — never the browser."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="offer-type">
            <Select
              id="offer-type"
              value={values.type}
              onChange={(event) => set("type", event.target.value as DiscountType)}
            >
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
              <option value="free_shipping">Free shipping</option>
            </Select>
          </Field>

          <Field
            label={isPercentage ? "Percentage off" : isFixed ? "Amount off (₹)" : "Value"}
            htmlFor="offer-value"
            error={errors.value}
          >
            {isPercentage ? (
              <div className="relative">
                <Input
                  id="offer-value"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={values.value}
                  onChange={(event) => set("value", event.target.value)}
                  invalid={Boolean(errors.value)}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">
                  %
                </span>
              </div>
            ) : isFixed ? (
              <Input
                id="offer-value"
                inputMode="decimal"
                value={values.value}
                onChange={(event) => set("value", event.target.value)}
                placeholder="150"
                invalid={Boolean(errors.value)}
              />
            ) : (
              <Input
                id="offer-value"
                value="Shipping waived"
                readOnly
                disabled
                aria-describedby="offer-value-note"
              />
            )}
          </Field>

          <Field
            label="Minimum cart value (₹)"
            htmlFor="offer-min-cart"
            error={errors.minCartValue}
            hint="Checked against eligible goods only. Leave empty for none."
          >
            <Input
              id="offer-min-cart"
              inputMode="decimal"
              value={values.minCartValue}
              onChange={(event) => set("minCartValue", event.target.value)}
              placeholder="999"
              invalid={Boolean(errors.minCartValue)}
            />
          </Field>

          {isPercentage ? (
            <Field
              label="Maximum discount (₹)"
              htmlFor="offer-max-discount"
              error={errors.maxDiscount}
              hint="Caps the percentage, e.g. 20% up to ₹500."
            >
              <Input
                id="offer-max-discount"
                inputMode="decimal"
                value={values.maxDiscount}
                onChange={(event) => set("maxDiscount", event.target.value)}
                placeholder="500"
                invalid={Boolean(errors.maxDiscount)}
              />
            </Field>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Schedule & limits"
          description="The offer is usable only inside this window and within its counters."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts at" htmlFor="offer-starts" error={errors.startsAt}>
            <Input
              id="offer-starts"
              type="datetime-local"
              value={values.startsAt}
              onChange={(event) => set("startsAt", event.target.value)}
              invalid={Boolean(errors.startsAt)}
            />
          </Field>

          <Field label="Expires at" htmlFor="offer-ends" error={errors.endsAt}>
            <Input
              id="offer-ends"
              type="datetime-local"
              value={values.endsAt}
              onChange={(event) => set("endsAt", event.target.value)}
              invalid={Boolean(errors.endsAt)}
            />
          </Field>

          <Field
            label="Total usage limit"
            htmlFor="offer-total-limit"
            error={errors.totalUsageLimit}
            hint="Leave empty for unlimited redemptions."
          >
            <Input
              id="offer-total-limit"
              type="number"
              min={1}
              step={1}
              value={values.totalUsageLimit}
              onChange={(event) => set("totalUsageLimit", event.target.value)}
              placeholder="Unlimited"
              invalid={Boolean(errors.totalUsageLimit)}
            />
          </Field>

          <Field
            label="Per-customer limit"
            htmlFor="offer-per-customer"
            error={errors.perCustomerLimit}
          >
            <Input
              id="offer-per-customer"
              type="number"
              min={1}
              step={1}
              value={values.perCustomerLimit}
              onChange={(event) => set("perCustomerLimit", event.target.value)}
              invalid={Boolean(errors.perCustomerLimit)}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Eligibility"
          description="Leave a list empty to apply to everything; exclusions always win."
        />
        <CardBody className="grid gap-5 lg:grid-cols-2">
          {optionsError ? (
            <p className="text-sm text-rose-600 lg:col-span-2" role="alert">
              {optionsError}
            </p>
          ) : null}

          <EntityPicker
            label="Applicable products"
            hint="Only these products qualify for the discount."
            options={productOptions}
            selected={values.applicableProductIds}
            onChange={(ids) => set("applicableProductIds", ids)}
            emptyLabel="No products match that search."
            idPrefix="offer-products"
          />

          <EntityPicker
            label="Applicable categories"
            hint="Products in these categories qualify."
            options={categoryOptions}
            selected={values.applicableCategoryIds}
            onChange={(ids) => set("applicableCategoryIds", ids)}
            emptyLabel="No categories match that search."
            idPrefix="offer-categories"
          />

          <div className="space-y-2">
            <EntityPicker
              label="Excluded products"
              hint="These never qualify, even inside an applicable category."
              options={productOptions}
              selected={values.excludedProductIds}
              onChange={(ids) => set("excludedProductIds", ids)}
              emptyLabel="No products match that search."
              idPrefix="offer-excluded-products"
            />
            {errors.excludedProductIds ? (
              <p className="text-xs text-rose-600" role="alert">
                {errors.excludedProductIds}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <EntityPicker
              label="Excluded categories"
              hint="Everything in these categories is ignored."
              options={categoryOptions}
              selected={values.excludedCategoryIds}
              onChange={(ids) => set("excludedCategoryIds", ids)}
              emptyLabel="No categories match that search."
              idPrefix="offer-excluded-categories"
            />
            {errors.excludedCategoryIds ? (
              <p className="text-xs text-rose-600" role="alert">
                {errors.excludedCategoryIds}
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Visibility" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Switch
            id="offer-customer-visible"
            checked={values.customerVisible}
            onChange={(checked) => set("customerVisible", checked)}
            label="Show on /offers"
            description="Customers can browse the code; it still works when hidden."
          />
          <Switch
            id="offer-active"
            checked={values.isActive}
            onChange={(checked) => set("isActive", checked)}
            label="Active"
            description="Turn off to stop the code working immediately."
          />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : offer ? "Save changes" : "Create offer"}
        </Button>
      </div>
    </form>
  );
}
