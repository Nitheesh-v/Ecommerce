"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { useDashboardOverview } from "@/hooks/use-dashboard-overview";
import { formatDateTime } from "@/lib/utils";
import type { DashboardQuery } from "@/services/admin/dashboard.service";
import { ActivityFeed } from "./activity-feed";
import { CategorySalesCard } from "./category-sales-card";
import { OrderStatusCard } from "./order-status-card";
import { RangeFilter, type RangeSelection } from "./range-filter";
import { RecentOrdersTable } from "./recent-orders-table";
import {
  LowStockCard,
  RecentCustomersCard,
  TopProductsCard,
} from "./side-lists";
import { StatCards } from "./stat-cards";
import { OrdersChart, RevenueChart } from "./trend-charts";

function SectionSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={<Skeleton className="h-3.5 w-32" />} />
      <div className="space-y-3 p-5">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </Card>
  );
}

export function DashboardView() {
  const [selection, setSelection] = useState<RangeSelection>({ range: "30d" });

  const customIncomplete =
    selection.range === "custom" && (!selection.from || !selection.to);

  const query: DashboardQuery | null = customIncomplete
    ? null
    : { range: selection.range, from: selection.from, to: selection.to };

  const { data, error, loading, refresh } = useDashboardOverview(query);
  const initialLoading = loading && !data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Store overview
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {data
              ? `${data.range.label} · updated ${formatDateTime(data.generatedAt)}`
              : "Live figures aggregated from your store data"}
          </p>
        </div>
        <RangeFilter
          value={selection}
          onChange={setSelection}
          disabled={initialLoading}
        />
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <StatCards metrics={data?.metrics ?? null} loading={loading} />

      {initialLoading ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <SectionSkeleton className="xl:col-span-2" />
            <SectionSkeleton />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <SectionSkeleton className="xl:col-span-2" />
            <SectionSkeleton />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <SectionSkeleton className="xl:col-span-2" />
            <SectionSkeleton />
          </div>
        </>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <RevenueChart series={data.revenueSeries} loading={loading} />
            </div>
            <OrderStatusCard distribution={data.orderStatusDistribution} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <OrdersChart series={data.ordersSeries} loading={loading} />
            </div>
            <CategorySalesCard categories={data.salesByCategory} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <RecentOrdersTable orders={data.recentOrders} />
            </div>
            <TopProductsCard products={data.topProducts} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <LowStockCard items={data.lowStock} />
            <RecentCustomersCard customers={data.recentCustomers} />
            <ActivityFeed
              orders={data.recentOrders}
              customers={data.recentCustomers}
              lowStock={data.lowStock}
            />
          </div>
        </>
      ) : customIncomplete ? (
        <EmptyState
          icon={CalendarRange}
          title="Choose a date range"
          description="Select a start and end date, then apply to load analytics for that period."
          className="bg-white py-16"
        />
      ) : null}
    </div>
  );
}
