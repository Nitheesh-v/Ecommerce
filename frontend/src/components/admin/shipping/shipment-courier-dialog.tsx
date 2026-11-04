"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import { useCourierOptions } from "@/hooks/use-shipment-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { shipmentsService } from "@/services/admin/shipments.service";
import { toast } from "@/store/toast.store";
import type {
  CourierProviderId,
  ShipmentDetail,
} from "@/types/shipment";
import { COURIER_PROVIDER_LABELS } from "@/types/shipment";

/**
 * Assign or correct the courier.
 *
 * Refused by the server once delivery is finalised, because the partner and the
 * AWB on a completed delivery are a historical record, not an editable field.
 */
export function ShipmentCourierDialog({
  open,
  shipment,
  onClose,
  onUpdated,
}: {
  open: boolean;
  shipment: Pick<
    ShipmentDetail,
    "id" | "shipmentNumber" | "courier" | "status"
  >;
  onClose: () => void;
  onUpdated: (shipment: ShipmentDetail) => void;
}) {
  const { options } = useCourierOptions();
  const providers = useMemo(
    () => options?.providers.filter((provider) => provider.enabled) ?? [],
    [options],
  );

  // Initialised from the shipment at mount: the parent remounts this dialog each
  // time it opens, so no state has to be re-synced inside an effect.
  const [provider, setProvider] = useState<CourierProviderId>(
    (shipment.courier.provider as CourierProviderId) ?? "manual",
  );
  const [courierName, setCourierName] = useState(shipment.courier.name);
  const [trackingNumber, setTrackingNumber] = useState(
    shipment.courier.trackingNumber ?? "",
  );
  const [trackingUrl, setTrackingUrl] = useState(shipment.courier.trackingUrl ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const next: Record<string, string> = {};

    if (trackingUrl.trim() && !trackingNumber.trim()) {
      next.trackingUrl = "A tracking link needs a tracking number";
    }
    if (trackingUrl.trim() && !/^https?:\/\//i.test(trackingUrl.trim())) {
      next.trackingUrl = "Use a full http(s) link";
    }

    setErrors(next);

    if (Object.keys(next).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const updated = await shipmentsService.updateCourier(shipment.id, {
        courierProvider: provider,
        courierName: courierName.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        trackingUrl: trackingUrl.trim() || undefined,
        reason: reason.trim() || undefined,
      });

      toast.success(`Courier updated for ${shipment.shipmentNumber}`);
      onUpdated(updated);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Courier & tracking"
      description={`Assign the partner and AWB for ${shipment.shipmentNumber}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Save courier
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Courier partner" htmlFor="courier-provider">
          <Select
            id="courier-provider"
            value={provider}
            onChange={(event) =>
              setProvider(event.target.value as CourierProviderId)
            }
          >
            {providers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {COURIER_PROVIDER_LABELS[candidate.id] ?? candidate.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Courier name on label" htmlFor="courier-name">
          <Input
            id="courier-name"
            value={courierName}
            onChange={(event) => setCourierName(event.target.value)}
            placeholder="e.g. Blue Dart Express"
            maxLength={80}
          />
        </Field>

        <Field label="Tracking number / AWB" htmlFor="courier-tracking">
          <Input
            id="courier-tracking"
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            maxLength={80}
          />
        </Field>

        <Field
          label="Tracking link"
          htmlFor="courier-tracking-url"
          error={errors.trackingUrl}
          hint="Only a link the courier actually provides"
        >
          <Input
            id="courier-tracking-url"
            type="url"
            value={trackingUrl}
            onChange={(event) => setTrackingUrl(event.target.value)}
            placeholder="https://…"
            invalid={Boolean(errors.trackingUrl)}
          />
        </Field>

        <Field
          label="Reason for the change"
          htmlFor="courier-reason"
          hint="Optional — stored in the history"
        >
          <Input
            id="courier-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Pickup failed with the original partner…"
            maxLength={500}
          />
        </Field>
      </div>
    </Dialog>
  );
}
