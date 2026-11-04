import {
  AlertTriangle,
  Clock3,
  IndianRupee,
  Package,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";
import { formatCompactNumber, formatCurrency } from "@/lib/utils";
import type { DashboardMetrics } from "@/types/admin";

interface StatDefinition {
  key: keyof DashboardMetrics;
  label: string;
  icon: LucideIcon;
  tint: string;
  hint: (metrics: DashboardMetrics) => string;
  format: (metrics: DashboardMetrics) => string;
}

const STATS: StatDefinition[] = [
  {
    key: "revenue",
    label: "Revenue",
    icon: IndianRupee,
    tint: "bg-indigo-50 text-indigo-600",
    hint: (metrics) =>
      `Avg order ${formatCurrency(metrics.averageOrderValue)}`,
    format: (metrics) => formatCurrency(metrics.revenue),
  },
  {
    key: "orders",
    label: "Orders",
    icon: ShoppingCart,
    tint: "bg-sky-50 text-sky-600",
    hint: () => "Placed in this period",
    format: (metrics) => formatCompactNumber(metrics.orders),
  },
  {
    key: "products",
    label: "Products",
    icon: Package,
    tint: "bg-violet-50 text-violet-600",
    hint: () => "Catalogue items",
    format: (metrics) => formatCompactNumber(metrics.products),
  },
  {
    key: "customers",
    label: "Customers",
    icon: Users,
    tint: "bg-emerald-50 text-emerald-600",
    hint: () => "Registered accounts",
    format: (metrics) => formatCompactNumber(metrics.customers),
  },
  {
    key: "pendingOrders",
    label: "Pending orders",
    icon: Clock3,
    tint: "bg-amber-50 text-amber-600",
    hint: () => "Awaiting confirmation",
    format: (metrics) => formatCompactNumber(metrics.pendingOrders),
  },
  {
    key: "lowStockProducts",
    label: "Low stock",
    icon: AlertTriangle,
    tint: "bg-rose-50 text-rose-600",
    hint: () => "At or below threshold",
    format: (metrics) => formatCompactNumber(metrics.lowStockProducts),
  },
];

export function StatCards({
  metrics,
  loading,
}: {
  metrics: DashboardMetrics | null;
  loading: boolean;
}) {
  if (!metrics && loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {STATS.map((stat) => (
          <Card key={stat.key} className="p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-28" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      aria-busy={loading}
    >
      {STATS.map((stat) => {
        const Icon = stat.icon;

        return (
          <Card
            key={stat.key}
            className="p-4 transition-colors hover:border-slate-300"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">{stat.label}</p>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${stat.tint}`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {metrics ? stat.format(metrics) : "—"}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {metrics ? stat.hint(metrics) : "Unavailable"}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
