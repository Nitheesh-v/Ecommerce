import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackageOpen,
  Truck,
  Waypoints,
} from "lucide-react";
import { Card } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";
import { cn } from "@/lib/utils";
import type { ShipmentStatus, ShipmentSummary } from "@/types/shipment";

/**
 * Cards for the shipping console.
 *
 * Every figure is an aggregate over the shipments collection — nothing is summed
 * in the browser, so the cards and the table can never disagree. Delayed is
 * derived from the promised date, not a stored flag; failed covers both a failed
 * attempt and a parcel that went back to the sender.
 */
export function ShipmentSummaryCards({
  summary,
  loading,
  onSelect,
}: {
  summary: ShipmentSummary | null;
  loading: boolean;
  onSelect?: (status: ShipmentStatus | null, delayedOnly?: boolean) => void;
}) {
  if (loading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <Card key={index} className="space-y-3 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-3 w-24" />
          </Card>
        ))}
      </div>
    );
  }

  const cards: Array<{
    label: string;
    value: number;
    hint: string;
    icon: typeof Truck;
    tone: string;
    onClick?: () => void;
  }> = [
    {
      label: "Total shipments",
      value: summary.totalCount,
      hint: "All parcels ever created",
      icon: PackageOpen,
      tone: "text-slate-900",
      onClick: () => onSelect?.(null, false),
    },
    {
      label: "Ready to ship",
      value: summary.readyToShip,
      hint: "Packed, awaiting pickup",
      icon: PackageCheck,
      tone: "text-sky-700",
      onClick: () => onSelect?.("ready_to_ship", false),
    },
    {
      label: "Shipped",
      value: summary.shipped,
      hint: "Handed to the courier",
      icon: Truck,
      tone: "text-sky-700",
      onClick: () => onSelect?.("shipped", false),
    },
    {
      label: "In transit",
      value: summary.inTransit,
      hint: "Moving between hubs",
      icon: Waypoints,
      tone: "text-indigo-700",
      onClick: () => onSelect?.("in_transit", false),
    },
    {
      label: "Out for delivery",
      value: summary.outForDelivery,
      hint: "On the last-mile van",
      icon: Clock3,
      tone: "text-indigo-700",
      onClick: () => onSelect?.("out_for_delivery", false),
    },
    {
      label: "Delivered",
      value: summary.delivered,
      hint: "Proof of delivery recorded",
      icon: CheckCircle2,
      tone: "text-emerald-700",
      onClick: () => onSelect?.("delivered", false),
    },
    {
      label: "Delayed / failed",
      value: summary.delayed + summary.failed,
      hint: `${summary.delayed} late · ${summary.failed} failed or returned`,
      icon: AlertTriangle,
      tone: "text-rose-700",
      onClick: () => onSelect?.(null, true),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((card) => (
        <Card key={card.label} className="p-4">
          <button
            type="button"
            onClick={card.onClick}
            disabled={!card.onClick}
            className={cn(
              "flex w-full items-start justify-between gap-2 text-left",
              card.onClick
                ? "rounded-lg transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
                : "cursor-default",
            )}
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium text-slate-500">
                {card.label}
              </span>
              <span
                className={cn("mt-1 block text-2xl font-semibold tracking-tight", card.tone)}
              >
                {card.value}
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-slate-400">
                {card.hint}
              </span>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
              <card.icon className="h-4 w-4" aria-hidden />
            </span>
          </button>
        </Card>
      ))}
    </div>
  );
}
