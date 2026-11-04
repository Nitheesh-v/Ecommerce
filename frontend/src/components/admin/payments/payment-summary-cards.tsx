import { CheckCircle2, Clock3, CreditCard, RotateCcw, XCircle } from "lucide-react";
import { Card } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";
import { cn, formatCurrency } from "@/lib/utils";
import type { PaymentSummary } from "@/types/payment";

/**
 * Totals for the transaction table.
 *
 * All figures come from the API's aggregate over the `payments` collection —
 * captured money is computed from gateway-verified records only, and the refunded
 * figure from refunds the order recorded as processed.
 */
export function PaymentSummaryCards({
  summary,
  loading,
}: {
  summary: PaymentSummary | null;
  loading: boolean;
}) {
  if (loading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total transactions",
      value: String(summary.totalCount),
      amount: formatCurrency(summary.totalAmount, summary.currency),
      hint: "Every gateway attempt",
      icon: CreditCard,
      tone: "text-slate-900",
    },
    {
      label: "Successful",
      value: String(summary.successfulCount),
      amount: formatCurrency(summary.successfulAmount, summary.currency),
      hint: "Captured, partially refunded or refunded",
      icon: CheckCircle2,
      tone: "text-emerald-700",
    },
    {
      label: "Pending",
      value: String(summary.pendingCount),
      amount: formatCurrency(summary.pendingAmount, summary.currency),
      hint: "Awaiting completion or authorization",
      icon: Clock3,
      tone: "text-amber-700",
    },
    {
      label: "Failed",
      value: String(summary.failedCount),
      amount: formatCurrency(summary.failedAmount, summary.currency),
      hint: "Failed or abandoned at checkout",
      icon: XCircle,
      tone: "text-rose-700",
    },
    {
      label: "Total refunded",
      value: formatCurrency(summary.refundedAmount, summary.currency),
      amount: "Processed only",
      hint: "Money actually returned to customers",
      icon: RotateCcw,
      tone: "text-indigo-700",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{card.label}</p>
              <p className={cn("mt-1 text-2xl font-semibold tracking-tight", card.tone)}>
                {card.value}
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-600">{card.amount}</p>
              <p className="mt-1 text-[11px] text-slate-400">{card.hint}</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
              <card.icon className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
