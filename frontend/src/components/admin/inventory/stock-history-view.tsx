"use client";

import Link from "next/link";
import { ArrowLeft, History, Search, X } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import { useStockHistory } from "@/hooks/use-stock-history";
import {
  MOVEMENT_TYPE_LABELS,
  type MovementType,
} from "@/types/inventory";
import { StockHistoryTable } from "./stock-history-table";

const TYPES: MovementType[] = [
  "initial",
  "adjustment",
  "order",
  "cancellation",
  "return",
  "correction",
];

export function StockHistoryView({ productId }: { productId?: string }) {
  const {
    filters,
    update,
    reset,
    refresh,
    items,
    meta,
    error,
    loading,
    hasActiveFilters,
  } = useStockHistory(productId ? { productId } : {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock history"
        description="An append-only record of every quantity change — who changed what, when and why."
        actions={
          <Link href="/admin/inventory">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to inventory
            </Button>
          </Link>
        }
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {filters.productId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Showing movements for one product.
          <button
            type="button"
            onClick={() => update({ productId: "" })}
            className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
          >
            <X className="h-3 w-3" aria-hidden />
            Show all products
          </button>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              value={filters.search}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Search by product, SKU or reference id…"
              aria-label="Search stock history"
              className="pl-9"
            />
          </div>

          <Select
            value={filters.type}
            onChange={(event) =>
              update({ type: event.target.value as "" | MovementType })
            }
            aria-label="Filter by movement type"
            className="lg:w-52"
          >
            <option value="">All movement types</option>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </Button>
          ) : null}
        </div>

        {!loading && items.length === 0 && meta !== null && hasActiveFilters ? (
          <div className="p-5">
            <EmptyState
              icon={History}
              title="No movements match these filters"
              description="Try a different type or search term."
              action={
                <Button variant="secondary" size="sm" onClick={reset} className="mt-2">
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : !loading && items.length === 0 && meta !== null ? (
          <div className="p-5">
            <EmptyState
              icon={History}
              title="No stock movements yet"
              description="Adjust a product's stock and the change will appear here."
            />
          </div>
        ) : (
          <StockHistoryTable items={items} loading={loading} />
        )}

        {meta ? (
          <Pagination
            meta={meta}
            onPageChange={(page) => update({ page })}
            disabled={loading}
          />
        ) : null}
      </Card>
    </div>
  );
}
