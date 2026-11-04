"use client";

import Link from "next/link";
import { AlertTriangle, Boxes, Download, History, Loader2, PackageX } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import { useInventoryList, useInventorySummary } from "@/hooks/use-inventory-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import { inventoryService } from "@/services/admin/inventory.service";
import { toast } from "@/store/toast.store";
import type { InventoryRow } from "@/types/inventory";
import type { Category } from "@/types/product";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { InventoryFiltersBar } from "./inventory-filters";
import { InventorySummaryCards } from "./inventory-summary";
import { InventoryTable } from "./inventory-table";

const CSV_HEADERS = [
  "Product",
  "SKU",
  "Category",
  "Price (minor units)",
  "Available",
  "Low stock threshold",
  "Status",
  "Last updated",
];

/** Escapes a CSV cell (quotes, commas, newlines). */
function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function InventoryView() {
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
  } = useInventoryList();
  const { summary, refresh: refreshSummary } = useInventorySummary();

  const [categories, setCategories] = useState<Category[]>([]);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    categoriesService
      .listAll()
      .then(setCategories)
      .catch(() => {
        // The filter degrades to "All categories"; the table still works.
      });
  }, []);


  const onSort = (field: typeof filters.sortBy) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "asc" ? "desc" : "asc",
    });
  };

  /**
   * CSV export of the *filtered* inventory (all pages, not just the visible one).
   * Fetched from the API so it can never contain stale client rows.
   */
  const onExport = async () => {
    setExporting(true);

    try {
      const rows: InventoryRow[] = [];
      let page = 1;
      let total = 0;

      do {
        const result = await inventoryService.list({
          page,
          limit: 100,
          search: filters.search || undefined,
          categoryId: filters.categoryId || undefined,
          stockStatus: filters.status || undefined,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
        });

        rows.push(...result.data);
        total = result.meta.total;
        page += 1;
      } while (rows.length < total);

      const csv = [
        CSV_HEADERS,
        ...rows.map((row) => [
          row.name,
          row.sku,
          row.categoryName ?? "",
          row.price,
          row.stock,
          row.lowStockThreshold,
          row.stockStatus,
          new Date(row.updatedAt).toISOString(),
        ]),
      ]
        .map((line) => line.map(csvCell).join(","))
        .join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length} product${rows.length === 1 ? "" : "s"}`);
    } catch (error_) {
      toast.error(getApiErrorMessage(error_));
    } finally {
      setExporting(false);
    }
  };

  const alertCount = summary ? summary.alerts.low + summary.alerts.out : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Every quantity change is audited. Adjust stock here — product edits never touch it."
        actions={
          <>
            <Button variant="secondary" onClick={onExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Export CSV
            </Button>
            <Link href="/admin/inventory/history">
              <Button variant="secondary">
                <History className="h-4 w-4" aria-hidden />
                Stock history
              </Button>
            </Link>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <InventorySummaryCards summary={summary} />

      {alertCount > 0 ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p className="text-sm text-amber-900">
              {summary?.alerts.out ? (
                <>
                  <span className="font-semibold">{summary.alerts.out}</span> product
                  {summary.alerts.out === 1 ? " is" : "s are"} out of stock.{" "}
                </>
              ) : null}
              {summary?.alerts.low ? (
                <>
                  <span className="font-semibold">{summary.alerts.low}</span> running low.
                </>
              ) : null}{" "}
              Restock these first.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {summary?.alerts.out ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => update({ status: "out" })}
              >
                <PackageX className="h-3.5 w-3.5" aria-hidden />
                Out of stock
              </Button>
            ) : null}
            {summary?.alerts.low ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => update({ status: "low" })}
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Low stock
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <InventoryFiltersBar
          filters={filters}
          categories={categories}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {!loading && items.length === 0 && meta !== null && hasActiveFilters ? (
          <div className="p-5">
            <EmptyState
              icon={Boxes}
              title="No products match these filters"
              description="Try another search term, or clear the filters to see the whole inventory."
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
              icon={Boxes}
              title="Nothing to track yet"
              description="Add products to the catalogue and their stock will show up here."
              action={
                <Link href="/admin/products/create" className="mt-2 block">
                  <Button size="sm">Add a product</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <InventoryTable
            items={items}
            loading={loading}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onSort={onSort}
            onAdjust={setAdjusting}
          />
        )}

        {meta ? (
          <Pagination
            meta={meta}
            onPageChange={(page) => update({ page })}
            disabled={loading}
          />
        ) : null}
      </Card>

      <AdjustStockDialog
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onAdjusted={() => {
          // The server already applied and audited the change — re-read both
          // views so the numbers on screen are the database, not a guess.
          refresh();
          refreshSummary();
        }}
      />
    </div>
  );
}
