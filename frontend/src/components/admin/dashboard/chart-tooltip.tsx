"use client";

import { formatCurrency, formatShortDay } from "@/lib/utils";

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  /** How to render a single value. Defaults to plain numbers. */
  valueKind?: "currency" | "count";
}

/** Compact INR for axis ticks: ₹950, ₹1.2K, ₹3.4L, ₹1.1Cr. */
export function compactCurrency(minorUnits: number) {
  const value = (minorUnits ?? 0) / 100;
  const absolute = Math.abs(value);

  if (absolute >= 1_00_00_000) {
    return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  }

  if (absolute >= 1_00_000) {
    return `₹${(value / 1_00_000).toFixed(1)}L`;
  }

  if (absolute >= 1_000) {
    return `₹${(value / 1_000).toFixed(1)}K`;
  }

  return `₹${Math.round(value)}`;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueKind = "count",
}: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0];
  const rawValue = Number(entry.value ?? 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg shadow-slate-900/5">
      <p className="font-medium text-slate-500">
        {typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label)
          ? formatShortDay(label)
          : label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">
        {valueKind === "currency"
          ? formatCurrency(rawValue)
          : rawValue.toLocaleString("en-IN")}
      </p>
    </div>
  );
}
