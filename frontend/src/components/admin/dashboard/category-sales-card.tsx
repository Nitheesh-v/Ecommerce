"use client";

import { Tags } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { EmptyState } from "@/components/admin/ui/states";
import { formatCurrency } from "@/lib/utils";
import type { CategorySalesPoint } from "@/types/admin";

/**
 * Ranking bars rather than a chart: category names are long, and comparing a
 * handful of values is easier along a shared baseline than inside a pie.
 */
export function CategorySalesCard({
  categories,
}: {
  categories: CategorySalesPoint[];
}) {
  const rows = [...categories].sort((a, b) => b.revenue - a.revenue);
  const max = rows[0]?.revenue ?? 0;

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Sales by category"
        description="Revenue and order count per category"
      />
      <CardBody>
        {rows.length === 0 || max === 0 ? (
          <EmptyState
            icon={Tags}
            title="No category sales yet"
            description="Category revenue is derived from order line items in this period."
            className="h-[228px] border-0"
          />
        ) : (
          <ul className="space-y-3.5">
            {rows.slice(0, 6).map((row) => {
              const share = max === 0 ? 0 : Math.max(2, (row.revenue / max) * 100);

              return (
                <li key={row.category}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-medium text-slate-700">
                      {row.category}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {formatCurrency(row.revenue)}
                      <span className="ml-1.5 text-slate-400">
                        · {row.orders} ord
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
