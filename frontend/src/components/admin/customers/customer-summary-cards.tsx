import { BadgeCheck, Repeat, TrendingUp, UserMinus, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";
import { formatCurrency } from "@/lib/utils";
import type { CustomerOverview } from "@/types/customer";

/**
 * Customer analytics.
 *
 * Every figure comes from the API's aggregate (`/admin/customers/summary`), which
 * is computed from the `users` and `orders` collections — no client-side estimates.
 */
export function CustomerSummaryCards({
  overview,
  loading,
}: {
  overview: CustomerOverview | null;
  loading: boolean;
}) {
  if (loading || !overview) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total customers",
      value: String(overview.totalCustomers),
      hint: "Registered customer accounts",
      icon: Users,
      tone: "text-slate-900",
    },
    {
      label: "New this month",
      value: String(overview.newThisMonth),
      hint: "Registered since the 1st",
      icon: UserPlus,
      tone: "text-slate-900",
    },
    {
      label: "Active",
      value: String(overview.active),
      hint: `${overview.suspended} suspended · ${overview.deactivated} deactivated`,
      icon: BadgeCheck,
      tone: "text-emerald-700",
    },
    {
      label: "Repeat customers",
      value: String(overview.repeatCustomers),
      hint: "Two or more successful purchases",
      icon: Repeat,
      tone: "text-indigo-700",
    },
    {
      label: "Average spend",
      value: formatCurrency(overview.averageSpend),
      hint: `Across ${overview.buyingCustomers} buying customer${overview.buyingCustomers === 1 ? "" : "s"}`,
      icon: TrendingUp,
      tone: "text-slate-900",
    },
    {
      label: "Net revenue from customers",
      value: formatCurrency(overview.totalNetSpent),
      hint: "Paid orders minus processed refunds",
      icon: UserMinus,
      tone: "text-slate-900",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{card.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
              <p className="mt-1 text-[11px] text-slate-500">{card.hint}</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <card.icon className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
