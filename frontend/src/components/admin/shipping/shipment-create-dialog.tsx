"use client";

import { useMemo, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { useCourierOptions, useEligibleOrders } from "@/hooks/use-shipment-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/utils";
import { shipmentsService } from "@/services/admin/shipments.service";
import { toast } from "@/store/toast.store";
import type {
  CourierProvider,
  CourierProviderId,
  EligibleOrder,
  ShipmentDetail,
} from "@/types/shipment";
import { COURIER_PROVIDER_LABELS } from "@/types/shipment";

interface FormState {
  orderId: string;
  courierProvider: CourierProviderId;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
  shippingCost: string;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  estimatedDelivery: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  orderId: "",
  courierProvider: "manual",
  courierName: "",
  trackingNumber: "",
  trackingUrl: "",
  shippingCost: "0",
  weightGrams: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  estimatedDelivery: "",
  notes: "",
};

/**
 * Create a shipment for a confirmed or processing order.
 *
 * The address is never part of this form: it is copied from the order's frozen
 * checkout snapshot by the server, so a typo (or a stray edit) here cannot send a
 * paid parcel somewhere else. Only orders the API says are eligible appear in the
 * picker, which is why an already-shipped order simply is not offered.
 */
export function ShipmentCreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (shipment: ShipmentDetail) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [orderSearch, setOrderSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const { orders, error: ordersError } = useEligibleOrders(open ? orderSearch : "");
  const { options: courierOptions } = useCourierOptions();

  const providers = useMemo(
    () => courierOptions?.providers.filter((provider) => provider.enabled) ?? [],
    [courierOptions],
  );

  const selectedOrder = orders.find((order) => order.id === form.orderId) ?? null;
  const selectedProvider =
    providers.find((provider) => provider.id === form.courierProvider) ?? null;

  const patch = (next: Partial<FormState>) =>
    setForm((previous) => ({ ...previous, ...next }));

  const closeDialog = () => {
    setForm(EMPTY_FORM);
    setOrderSearch("");
    setErrors({});
    setSubmitting(false);
    onClose();
  };

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};

    if (!form.orderId) {
      next.orderId = "Choose the order this parcel belongs to";
    } else if (!orders.some((order) => order.id === form.orderId)) {
      // The picker is server-driven: an order that just shipped is no longer eligible.
      next.orderId = "That order can no longer be shipped — choose another";
    }

    const cost = Number(form.shippingCost);

    if (!Number.isFinite(cost) || cost < 0) {
      next.shippingCost = "Enter the delivery cost (0 is allowed for free shipping)";
    }

    if (form.trackingUrl.trim() && !form.trackingNumber.trim()) {
      next.trackingUrl = "A tracking link needs a tracking number";
    }

    const weight = form.weightGrams.trim() ? Number(form.weightGrams) : undefined;

    if (weight !== undefined && (!Number.isInteger(weight) || weight < 1)) {
      next.weightGrams = "Weight is a whole number of grams";
    }

    const dimensionKeys: Array<[keyof FormState, string]> = [
      ["lengthCm", "Length"],
      ["widthCm", "Width"],
      ["heightCm", "Height"],
    ];
    const dimensions = dimensionKeys.map(([key]) => form[key].trim());
    const anyDimension = dimensions.some((value) => value !== "");
    const allDimensions = dimensions.every((value) => value !== "");

    if (anyDimension && !allDimensions) {
      next.dimensions = "Give all three dimensions, or none";
    }

    return next;
  };

  const onSubmit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const dimensions =
      form.lengthCm.trim() && form.widthCm.trim() && form.heightCm.trim()
        ? {
            lengthCm: Number(form.lengthCm),
            widthCm: Number(form.widthCm),
            heightCm: Number(form.heightCm),
          }
        : undefined;

    setSubmitting(true);

    try {
      const created = await shipmentsService.create({
        orderId: form.orderId,
        courierProvider: form.courierProvider,
        courierName: form.courierName.trim() || undefined,
        trackingNumber: form.trackingNumber.trim() || undefined,
        trackingUrl: form.trackingUrl.trim() || undefined,
        shippingCost: Math.round(Number(form.shippingCost) * 100),
        weightGrams: form.weightGrams.trim() ? Number(form.weightGrams) : undefined,
        dimensions,
        estimatedDelivery: form.estimatedDelivery
          ? new Date(`${form.estimatedDelivery}T12:00:00`).toISOString()
          : undefined,
        notes: form.notes.trim() || undefined,
      });

      toast.success(`Shipment ${created.shipmentNumber} created`);
      onCreated(created);
      closeDialog();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      title="Create shipment"
      description="Only confirmed or processing orders that are paid (or cash on delivery) can ship."
      footer={
        <>
          <Button variant="secondary" onClick={closeDialog} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || orders.length === 0}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <PackagePlus className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            Create shipment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Order" htmlFor="shipment-order" error={errors.orderId}>
          <Input
            type="search"
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
            placeholder="Search order number or customer…"
            aria-label="Search eligible orders"
            className="mb-2"
          />
          <Select
            id="shipment-order"
            value={form.orderId}
            onChange={(event) => patch({ orderId: event.target.value })}
            invalid={Boolean(errors.orderId)}
          >
            <option value="">
              {orders.length === 0 ? "No eligible orders" : "Select an order"}
            </option>
            {orders.map((order: EligibleOrder) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} — {order.customerName} ({order.itemCount} item
                {order.itemCount === 1 ? "" : "s"},{" "}
                {formatCurrency(order.total, order.currency)})
              </option>
            ))}
          </Select>
        </Field>

        {ordersError ? (
          <p className="text-xs text-rose-600">{ordersError}</p>
        ) : null}

        {selectedOrder ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-medium text-slate-800">{selectedOrder.customerName}</p>
            <p className="mt-0.5">{selectedOrder.addressLine}</p>
            <p className="mt-1 text-slate-500">
              {selectedOrder.statusLabel} ·{" "}
              {selectedOrder.paymentMethod === "cod"
                ? "Cash on delivery"
                : `Paid (${selectedOrder.paymentStatus})`}
            </p>
            <p className="mt-1 text-slate-400">
              The delivery address is copied from the order and cannot be edited here.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Courier partner"
            htmlFor="shipment-courier-provider"
            hint={selectedProvider?.automated ? "API integration enabled" : undefined}
          >
            <Select
              id="shipment-courier-provider"
              value={form.courierProvider}
              onChange={(event) =>
                patch({ courierProvider: event.target.value as CourierProviderId })
              }
            >
              {providers.map((provider: CourierProvider) => (
                <option key={provider.id} value={provider.id}>
                  {COURIER_PROVIDER_LABELS[provider.id] ?? provider.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Courier name on label"
            htmlFor="shipment-courier-name"
            hint="Optional — defaults to the partner name"
          >
            <Input
              id="shipment-courier-name"
              value={form.courierName}
              onChange={(event) => patch({ courierName: event.target.value })}
              placeholder="e.g. Delhivery Surface"
              maxLength={80}
            />
          </Field>

          <Field label="Tracking number / AWB" htmlFor="shipment-tracking">
            <Input
              id="shipment-tracking"
              value={form.trackingNumber}
              onChange={(event) => patch({ trackingNumber: event.target.value })}
              placeholder="Assigned by the courier"
              maxLength={80}
            />
          </Field>

          <Field
            label="Tracking link"
            htmlFor="shipment-tracking-url"
            error={errors.trackingUrl}
            hint="Optional — only a link the courier actually provides"
          >
            <Input
              id="shipment-tracking-url"
              type="url"
              value={form.trackingUrl}
              onChange={(event) => patch({ trackingUrl: event.target.value })}
              placeholder="https://…"
              invalid={Boolean(errors.trackingUrl)}
            />
          </Field>

          <Field
            label="Shipping cost (₹)"
            htmlFor="shipment-cost"
            error={errors.shippingCost}
          >
            <Input
              id="shipment-cost"
              type="number"
              min="0"
              step="0.01"
              value={form.shippingCost}
              onChange={(event) => patch({ shippingCost: event.target.value })}
              invalid={Boolean(errors.shippingCost)}
            />
          </Field>

          <Field label="Estimated delivery" htmlFor="shipment-eta">
            <Input
              id="shipment-eta"
              type="date"
              value={form.estimatedDelivery}
              onChange={(event) => patch({ estimatedDelivery: event.target.value })}
            />
          </Field>

          <Field label="Package weight (g)" htmlFor="shipment-weight" error={errors.weightGrams}>
            <Input
              id="shipment-weight"
              type="number"
              min="1"
              step="1"
              value={form.weightGrams}
              onChange={(event) => patch({ weightGrams: event.target.value })}
              placeholder="Optional"
              invalid={Boolean(errors.weightGrams)}
            />
          </Field>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">
              Dimensions (cm)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Input
                aria-label="Length in centimetres"
                type="number"
                min="1"
                value={form.lengthCm}
                onChange={(event) => patch({ lengthCm: event.target.value })}
                placeholder="L"
                invalid={Boolean(errors.dimensions)}
              />
              <Input
                aria-label="Width in centimetres"
                type="number"
                min="1"
                value={form.widthCm}
                onChange={(event) => patch({ widthCm: event.target.value })}
                placeholder="W"
                invalid={Boolean(errors.dimensions)}
              />
              <Input
                aria-label="Height in centimetres"
                type="number"
                min="1"
                value={form.heightCm}
                onChange={(event) => patch({ heightCm: event.target.value })}
                placeholder="H"
                invalid={Boolean(errors.dimensions)}
              />
            </div>
            {errors.dimensions ? (
              <p className="mt-1 text-xs text-rose-600">{errors.dimensions}</p>
            ) : null}
          </div>
        </div>

        <Field
          label="Internal notes"
          htmlFor="shipment-notes"
          hint="Never shown to customers"
        >
          <Textarea
            id="shipment-notes"
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            placeholder="Packing instructions, fragile items, agreed delivery window…"
            maxLength={1000}
          />
        </Field>
      </div>
    </Dialog>
  );
}
