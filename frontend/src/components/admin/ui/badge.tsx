import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-50 text-slate-600 ring-slate-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  accent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

const ORDER_TONES: Record<string, Tone> = {
  pending: "warning",
  confirmed: "info",
  processing: "accent",
  shipped: "info",
  out_for_delivery: "accent",
  delivered: "success",
  cancelled: "danger",
  returned: "danger",
};

const PAYMENT_TONES: Record<string, Tone> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
};

export function humanizeStatus(status: string) {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={ORDER_TONES[status] ?? "neutral"}>{humanizeStatus(status)}</Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={PAYMENT_TONES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </Badge>
  );
}
