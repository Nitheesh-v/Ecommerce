import {
  BadgeCheck,
  CircleDollarSign,
  PackageCheck,
  RotateCcw,
  StickyNote,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  FULFILMENT_STEPS,
  ORDER_STATUS_LABELS,
  type HistoryKind,
  type Order,
  type OrderHistoryEntry,
} from "@/types/order";

const KIND_ICONS: Record<HistoryKind, LucideIcon> = {
  status: PackageCheck,
  payment: CircleDollarSign,
  shipping: Truck,
  cancellation: XCircle,
  return: RotateCcw,
  refund: CircleDollarSign,
  note: StickyNote,
};

/**
 * Fulfilment stepper.
 *
 * Shows how far along the happy path an order is. Cancelled/returned orders are
 * terminal branches, so they replace the stepper with a plain banner instead of
 * pretending a bar is "almost done".
 */
export function OrderProgress({ order }: { order: Order }) {
  if (order.status === "cancelled" || order.status === "returned") {
    const terminal = order.status === "cancelled" ? order.cancellation : null;

    return (
      <div
        className={cn(
          "rounded-xl border px-4 py-3",
          order.status === "cancelled"
            ? "border-rose-200 bg-rose-50"
            : "border-slate-200 bg-slate-50",
        )}
      >
        <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <XCircle className="h-4 w-4 text-rose-600" aria-hidden />
          {ORDER_STATUS_LABELS[order.status]}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          {terminal
            ? `${terminal.reason} · ${formatDateTime(terminal.cancelledAt)}${
                terminal.restocked ? " · stock restored" : ""
              }`
            : "The order was returned to the store."}
        </p>
      </div>
    );
  }

  const currentIndex =
    order.status === "return_requested"
      ? FULFILMENT_STEPS.length - 1
      : FULFILMENT_STEPS.indexOf(order.status);

  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {FULFILMENT_STEPS.map((step, index) => {
        const done = index <= currentIndex;
        const active = index === currentIndex;

        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                done
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-400",
                active && "ring-2 ring-slate-900/15",
              )}
              aria-hidden
            >
              {done ? <BadgeCheck className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-[11px]",
                active ? "font-semibold text-slate-900" : "text-slate-500",
              )}
            >
              {ORDER_STATUS_LABELS[step]}
            </span>
            {index < FULFILMENT_STEPS.length - 1 ? (
              <span
                className={cn(
                  "hidden h-px flex-1 sm:block",
                  index < currentIndex ? "bg-slate-900" : "bg-slate-200",
                )}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Full, append-only history of the order, newest first. */
export function OrderTimeline({ entries }: { entries: OrderHistoryEntry[] }) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  if (sorted.length === 0) {
    return <p className="text-xs text-slate-500">No activity recorded yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {sorted.map((entry, index) => {
        const Icon = KIND_ICONS[entry.kind] ?? StickyNote;
        const title =
          entry.kind === "status" && entry.to
            ? `${entry.from ? `${ORDER_STATUS_LABELS[entry.from as keyof typeof ORDER_STATUS_LABELS] ?? entry.from} → ` : ""}${
                ORDER_STATUS_LABELS[entry.to as keyof typeof ORDER_STATUS_LABELS] ?? entry.to
              }`
            : entry.kind.replace(/_/g, " ");

        return (
          <li key={`${entry.at}-${index}`} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-800 capitalize">{title}</p>
              {entry.note || entry.reason ? (
                <p className="mt-0.5 text-xs text-slate-600">{entry.note ?? entry.reason}</p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-slate-400">
                {formatDateTime(entry.at)}
                {entry.by?.email ? ` · ${entry.by.email}` : " · system"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
