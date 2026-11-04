"use client";

import { LineChart as LineChartIcon, ShoppingCart } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { EmptyState } from "@/components/admin/ui/states";
import { formatShortDay } from "@/lib/utils";
import type { TimeSeriesPoint } from "@/types/admin";
import { ChartTooltip, compactCurrency } from "./chart-tooltip";

const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" } as const;

function hasData(series: TimeSeriesPoint[]) {
  return series.some((point) => point.value > 0);
}

function ChartPlaceholder() {
  return (
    <div className="h-[260px] animate-pulse rounded-lg bg-slate-100" aria-hidden />
  );
}

export function RevenueChart({
  series,
  loading,
}: {
  series: TimeSeriesPoint[];
  loading: boolean;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Revenue over time"
        description="Paid orders, excluding cancelled and returned"
        action={
          loading ? (
            <span className="text-xs text-slate-400">Updating…</span>
          ) : null
        }
      />
      <CardBody className="pt-2">
        {!hasData(series) ? (
          <EmptyState
            icon={LineChartIcon}
            title="No revenue in this period"
            description="Revenue appears as soon as orders are paid. Try a wider date range."
            className="h-[228px] border-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={series}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#eef2f7"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDay}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={compactCurrency}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <Tooltip
                content={<ChartTooltip valueKind="currency" />}
                cursor={{ stroke: "#c7d2fe", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Revenue"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#revenueFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

export function OrdersChart({
  series,
  loading,
}: {
  series: TimeSeriesPoint[];
  loading: boolean;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Orders over time"
        description="Order volume per day"
        action={
          loading ? (
            <span className="text-xs text-slate-400">Updating…</span>
          ) : null
        }
      />
      <CardBody className="pt-2">
        {!hasData(series) ? (
          <EmptyState
            icon={ShoppingCart}
            title="No orders in this period"
            description="Once customers start checking out, daily volume shows up here."
            className="h-[228px] border-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={series}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#eef2f7"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDay}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "rgba(99, 102, 241, 0.06)" }}
              />
              <Bar
                dataKey="value"
                name="Orders"
                fill="#38bdf8"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

export { ChartPlaceholder };
