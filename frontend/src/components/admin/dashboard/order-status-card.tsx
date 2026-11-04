"use client";

import { PieChart as PieIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { humanizeStatus } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/states";
import { formatCompactNumber } from "@/lib/utils";
import type { OrderStatusCount } from "@/types/admin";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#0ea5e9",
  processing: "#6366f1",
  shipped: "#3b82f6",
  out_for_delivery: "#8b5cf6",
  delivered: "#10b981",
  cancelled: "#ef4444",
  returned: "#f43f5e",
};

const FALLBACK_COLORS = ["#94a3b8", "#cbd5e1", "#64748b", "#e2e8f0"];

interface PieTooltipEntry {
  name?: string;
  value?: number;
}

function StatusTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: PieTooltipEntry[];
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg shadow-slate-900/5">
      <p className="font-medium text-slate-500">
        {humanizeStatus(String(entry.name ?? ""))}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">
        {Number(entry.value ?? 0).toLocaleString("en-IN")} orders
      </p>
    </div>
  );
}

export function OrderStatusCard({
  distribution,
}: {
  distribution: OrderStatusCount[];
}) {
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  const chartData = distribution.filter((item) => item.count > 0);

  return (
    <Card className="min-w-0">
      <CardHeader title="Order status" description="Share of orders by stage" />
      <CardBody className="pt-2">
        {total === 0 ? (
          <EmptyState
            icon={PieIcon}
            title="No orders to break down"
            description="Status distribution appears once orders exist in this period."
            className="h-[228px] border-0"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={entry.status}
                        fill={
                          STATUS_COLORS[entry.status] ??
                          FALLBACK_COLORS[index % FALLBACK_COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<StatusTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatCompactNumber(total)}
                </span>
                <span className="text-[11px] text-slate-500">orders</span>
              </div>
            </div>

            <ul className="w-full min-w-0 space-y-1.5">
              {distribution.map((item, index) => {
                const share = total === 0 ? 0 : (item.count / total) * 100;

                return (
                  <li
                    key={item.status}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          STATUS_COLORS[item.status] ??
                          FALLBACK_COLORS[index % FALLBACK_COLORS.length],
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-600">
                      {humanizeStatus(item.status)}
                    </span>
                    <span className="font-medium text-slate-900 tabular-nums">
                      {item.count}
                    </span>
                    <span className="w-10 text-right text-slate-400 tabular-nums">
                      {share.toFixed(0)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
