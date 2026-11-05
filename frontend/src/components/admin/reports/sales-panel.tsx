"use client";

import { Package, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { EmptyState, Skeleton } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { CategorySalesCard } from "@/components/admin/dashboard/category-sales-card";
import { OrderStatusCard } from "@/components/admin/dashboard/order-status-card";
import { RevenueChart } from "@/components/admin/dashboard/trend-charts";
import { formatCurrency } from "@/lib/utils";
import type { SalesReport } from "@/types/report";

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof TrendingUp;
}) {
  return (
    <Card className="min-w-0">
      <CardBody className="flex items-start gap-3">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-slate-900">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * The sales report: what sold, for how much, in what state.
 *
 * Charts come from the dashboard components on purpose — one definition of revenue,
 * one rendering of it, whether you are looking at today or at a quarter.
 */
export function SalesPanel({
  report,
  loading,
  currency,
  locale,
}: {
  report: SalesReport | null;
  loading: boolean;
  currency: string;
  locale: string;
}) {
  const money = (value: number) => formatCurrency(value, currency, locale);

  if (loading && !report) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[320px] w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No sales report"
        description="Choose a date range to generate the sales report."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Revenue"
          value={money(report.totals.revenue)}
          hint={`${report.range.label}, paid orders only`}
          icon={TrendingUp}
        />
        <Stat
          label="Orders"
          value={report.totals.orders.toLocaleString(locale)}
          hint="Placed in this window"
          icon={ShoppingBag}
        />
        <Stat
          label="Average order value"
          value={money(report.totals.averageOrderValue)}
          hint="Revenue ÷ paid orders"
          icon={Receipt}
        />
        <Stat
          label="Catalogue"
          value={`${report.totals.products.toLocaleString(locale)} products`}
          hint={`${report.totals.customers.toLocaleString(locale)} customers`}
          icon={Package}
        />
      </div>

      <RevenueChart series={report.revenueSeries} loading={loading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <OrderStatusCard distribution={report.statusMix} />
        <CategorySalesCard categories={report.categorySales} />
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="Top products"
          description="By revenue in the selected window"
        />
        <CardBody className="p-0">
          {report.topProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nothing sold yet"
              description="Products appear here once orders are placed in this period."
              className="m-5 border-0"
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Product</TableHeaderCell>
                  <TableHeaderCell className="text-right">Units</TableHeaderCell>
                  <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.topProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium text-slate-900">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.unitsSold.toLocaleString(locale)}
                    </TableCell>
                    <TableCell className="text-right">{money(product.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
