"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { getApiErrorMessage } from "@/lib/api/errors";
import { shipmentsService } from "@/services/admin/shipments.service";
import { toast } from "@/store/toast.store";
import type { ShipmentDetail, ShipmentStatus } from "@/types/shipment";
import {
  NEXT_SHIPMENT_STATUSES,
  requiresReason,
  SHIPMENT_STATUS_LABELS,
} from "@/types/shipment";

/**
 * Move a shipment through the delivery state machine.
 *
 * Only legal next steps are offered — the server rejects anything else, so this
 * list is a convenience that mirrors `ALLOWED_SHIPMENT_TRANSITIONS`, never a
 * second source of truth. Nothing here marks an order delivered on its own: the
 * order moves only because the backend promoted it.
 */
export function ShipmentStatusDialog({
  open,
  shipment,
  onClose,
  onUpdated,
}: {
  open: boolean;
  shipment: Pick<ShipmentDetail, "id" | "shipmentNumber" | "status" | "courier">;
  onClose: () => void;
  onUpdated: (shipment: ShipmentDetail) => void;
}) {
  const nextStatuses = NEXT_SHIPMENT_STATUSES[shipment.status];
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [actualDelivery, setActualDelivery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsReason = status !== "" && requiresReason(status);
  const needsCourier = status === "shipped";

  const onSubmit = async () => {
    if (status === "") {
      setError("Choose the next status");
      return;
    }
    if (needsReason && reason.trim().length === 0) {
      setError("A reason is required — the customer sees it on the tracking page");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const updated = await shipmentsService.updateStatus(shipment.id, {
        status,
        reason: reason.trim() || undefined,
        note: note.trim() || undefined,
        actualDelivery: actualDelivery
          ? new Date(`${actualDelivery}T12:00:00`).toISOString()
          : undefined,
      });

      toast.success(`${shipment.shipmentNumber} is now ${SHIPMENT_STATUS_LABELS[status]}`);
      onUpdated(updated);
      onClose();
    } catch (error_) {
      const message = getApiErrorMessage(error_);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Update delivery status"
      description={`${shipment.shipmentNumber} is currently ${SHIPMENT_STATUS_LABELS[shipment.status]}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || nextStatuses.length === 0}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Save status
          </Button>
        </>
      }
    >
      {nextStatuses.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This shipment is closed — {SHIPMENT_STATUS_LABELS[shipment.status].toLowerCase()}{" "}
          is final. Create a replacement shipment if the parcel has to move again.
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Next status" htmlFor="shipment-next-status">
            <Select
              id="shipment-next-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ShipmentStatus | "");
                setError(null);
              }}
            >
              <option value="">Select the next status</option>
              {nextStatuses.map((value) => (
                <option key={value} value={value}>
                  {SHIPMENT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          {needsCourier && !shipment.courier.trackingNumber ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Assign a courier and a tracking number first — a parcel cannot be marked
              shipped without them.
            </p>
          ) : null}

          {needsReason ? (
            <Field
              label="Reason"
              htmlFor="shipment-reason"
              hint="Stored in the history and shown to the customer"
            >
              <Textarea
                id="shipment-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Customer unreachable, address incomplete, refused on delivery…"
                maxLength={500}
              />
            </Field>
          ) : null}

          {status === "delivered" ? (
            <Field
              label="Delivered on"
              htmlFor="shipment-delivered-at"
              hint="Optional — defaults to now"
            >
              <Input
                id="shipment-delivered-at"
                type="date"
                value={actualDelivery}
                onChange={(event) => setActualDelivery(event.target.value)}
              />
            </Field>
          ) : null}

          <Field
            label="Internal note"
            htmlFor="shipment-status-note"
            hint="Never shown to customers"
          >
            <Input
              id="shipment-status-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Courier scan, pickup slip number…"
              maxLength={500}
            />
          </Field>

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
