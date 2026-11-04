import { AlertTriangle, Truck } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import {
  SHIPMENT_STATUS_LABELS,
  type CourierProvider,
  type ShipmentStatus,
} from "@/types/shipment";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

/**
 * Tones for the parcel lifecycle.
 *
 * Deliberately separate from the order badge: a delivered parcel and a delivered
 * order are different facts that usually — but not always — move together.
 */
const STATUS_TONES: Record<ShipmentStatus, Tone> = {
  pending: "neutral",
  ready_to_ship: "info",
  shipped: "info",
  in_transit: "accent",
  out_for_delivery: "accent",
  delivered: "success",
  delivery_failed: "danger",
  returned_to_sender: "warning",
};

export function ShipmentStatusBadge({
  status,
  delayed = false,
}: {
  status: ShipmentStatus;
  delayed?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={STATUS_TONES[status] ?? "neutral"}>
        {SHIPMENT_STATUS_LABELS[status] ?? status}
      </Badge>
      {delayed ? (
        <Badge tone="danger">
          <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
          Delayed
        </Badge>
      ) : null}
    </span>
  );
}

export function CourierLabel({
  name,
  automated,
}: {
  name: string;
  automated: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
      <Truck className="h-3.5 w-3.5 text-slate-400" aria-hidden />
      <span className="truncate">{name}</span>
      {automated ? (
        <span className="text-[11px] text-slate-400">API</span>
      ) : null}
    </span>
  );
}

/** Tracking link, rendered only when the courier supplied a valid URL. */
export function TrackingNumber({
  trackingNumber,
  trackingUrl,
}: {
  trackingNumber: string | null;
  trackingUrl: string | null;
}) {
  if (!trackingNumber) {
    return <span className="text-xs text-slate-400">No tracking number</span>;
  }

  return (
    <div className="min-w-0">
      {trackingUrl ? (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
          title={trackingUrl}
        >
          {trackingNumber}
        </a>
      ) : (
        <span className="font-mono text-xs text-slate-700">{trackingNumber}</span>
      )}
    </div>
  );
}

/** Shows whether a partner can be used today, and what it is missing. */
export function CourierAvailabilityBadge({ provider }: { provider: CourierProvider }) {
  if (provider.enabled) {
    return <Badge tone={provider.automated ? "info" : "neutral"}>Available</Badge>;
  }

  const count = provider.missingConfiguration.length;

  return (
    <Badge tone="warning">
      Needs {count} env var{count === 1 ? "" : "s"}
    </Badge>
  );
}
