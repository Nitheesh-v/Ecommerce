import { Badge } from "@/components/admin/ui/badge";
import { cn } from "@/lib/utils";
import { STOCK_STATUS_LABELS, type StockStatus } from "@/types/inventory";

const TONES = {
  in: "success",
  low: "warning",
  out: "danger",
} as const;

const DOTS = {
  in: "bg-emerald-500",
  low: "bg-amber-500",
  out: "bg-rose-500",
} as const;

/**
 * The single stock badge used across the console.
 *
 * `status` always comes from the API, which derives it as:
 * out = 0 units, low = 0 < qty ≤ threshold, in = qty > threshold.
 */
export function StockStatusBadge({
  status,
  className,
}: {
  status: StockStatus;
  className?: string;
}) {
  return (
    <Badge tone={TONES[status]} className={className}>
      <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", DOTS[status])} aria-hidden />
      {STOCK_STATUS_LABELS[status]}
    </Badge>
  );
}
