"use client";

import {
  Boxes,
  CircleDollarSign,
  Package,
  PackageX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";
import type { InventorySummary as Summary } from "@/types/inventory";

interface StatCard {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
}

function buildCards(summary: Summary): StatCard[] {
  return [
    {
      label: "Total products",
      value: formatCompactNumber(summary.totalProducts),
      hint: "Active catalogue items",
      icon: Package,
      tone: "bg-slate-100 text-slate-600",
    },
    {
      label: "Units in stock",
      value: formatCompactNumber(summary.totalUnits),
      hint: "Across every product",
      icon: Boxes,
      tone: "bg-sky-50 text-sky-600",
    },
    {
      label: "Low stock",
      value: formatCompactNumber(summary.lowStockProducts),
      hint: "At or below threshold",
      icon: TriangleAlert,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "Out of stock",
      value: formatCompactNumber(summary.outOfStockProducts),
      hint: "Nothing left to sell",
      icon: PackageX,
      tone: "bg-rose-50 text-rose-600",
    },
    {
      label: "Inventory value",
      value: formatCurrency(summary.inventoryValue),
      // Cost-based and admin-only: the storefront never receives this number.
      hint: `At cost · ${formatCurrency(summary.retailValue)} at list price`,
      icon: CircleDollarSign,
      tone: "bg-emerald-50 text-emerald-600",
    },
  ];
}

/**
 * Summary cards + two visual summaries (stock health split, units by category).
 *
 * Rendered as CSS bars rather than a chart library: the shapes here are
 * single-series proportions, and a dependency would add weight for no insight.
 */
export function InventorySummaryCards({ summary }: { summary: Summary | null }) {
  if (!summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardBody className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  const cards = buildCards(summary);
  const total = Math.max(summary.totalProducts, 1);
  const segments = [
    { key: "in", units: summary.inStockProducts, colour: "bg-emerald-500", label: "In stock" },
    { key: "low", units: summary.lowStockProducts, colour: "bg-amber-500", label: "Low stock" },
    { key: "out", units: summary.outOfStockProducts, colour: "bg-rose-500", label: "Out of stock" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardBody className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                  {card.label}
                </p>
                <p className="mt-1 truncate text-xl font-semibold text-slate-900">
                  {card.value}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{card.hint}</p>
              </div>
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  card.tone,
                )}
              >
                <card.icon className="h-4 w-4" aria-hidden />
              </span>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Stock health"
            description="Share of the catalogue in each state"
          />
          <CardBody className="space-y-4">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {segments.map((segment) => (
                <div
                  key={segment.key}
                  className={segment.colour}
                  style={{ width: `${(segment.units / total) * 100}%` }}
                />
              ))}
            </div>

            <ul className="grid grid-cols-3 gap-2 text-center">
              {segments.map((segment) => (
                <li key={segment.key} className="rounded-lg bg-slate-50 px-2 py-2">
                  <span className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <span className={cn("h-1.5 w-1.5 rounded-full", segment.colour)} aria-hidden />
                    {segment.label}
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold text-slate-900">
                    {segment.units}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Units by category" description="Top categories by stock" />
          <CardBody>
            {summary.byCategory.length === 0 ? (
              <p className="text-xs text-slate-500">No categorised stock yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {summary.byCategory.slice(0, 5).map((group) => {
                  const max = Math.max(...summary.byCategory.map((item) => item.units), 1);
                  return (
                    <li key={group.categoryId || group.name} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate text-slate-600">{group.name}</span>
                        <span className="shrink-0 font-medium text-slate-900">
                          {group.units}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-400"
                          style={{ width: `${(group.units / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
