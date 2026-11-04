"use client";

import Link from "next/link";
import { ArrowDownUp, History, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { Skeleton } from "@/components/admin/ui/states";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import type { InventoryRow, StockSortField } from "@/types/inventory";
import { StockStatusBadge } from "./stock-status-badge";

const COLUMNS = [
  "Product",
  "SKU",
  "Category",
  "Price",
  "Available",
  "Status",
  "Last updated",
  "Actions",
];

export function InventoryTable({
  items,
  loading,
  sortBy,
  sortOrder,
  onSort,
  onAdjust,
}: {
  items: InventoryRow[];
  loading: boolean;
  sortBy: StockSortField;
  sortOrder: "asc" | "desc";
  onSort: (field: StockSortField) => void;
  onAdjust: (row: InventoryRow) => void;
}) {
  // Quantity and name are the two sortable columns the brief asks for.
  const sortable: Partial<Record<string, StockSortField>> = {
    Product: "name",
    Available: "quantity",
    Price: "price",
    "Last updated": "updatedAt",
  };

  return (
    <Table className="min-w-[60rem]">
      <TableHead>
        {COLUMNS.map((column) => {
          const field = sortable[column];
          const active = field !== undefined && sortBy === field;

          return (
            <TableHeaderCell key={column} aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
              {field ? (
                <button
                  type="button"
                  onClick={() => onSort(field)}
                  className={cn(
                    "inline-flex items-center gap-1 transition-colors hover:text-slate-800",
                    active ? "text-slate-900" : "text-slate-500",
                  )}
                >
                  {column}
                  <ArrowDownUp
                    className={cn("h-3 w-3", active ? "opacity-90" : "opacity-40")}
                    aria-hidden
                  />
                </button>
              ) : (
                column
              )}
            </TableHeaderCell>
          );
        })}
      </TableHead>

      <TableBody>
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </TableCell>
                <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                <TableCell><Skeleton className="h-3 w-12" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                <TableCell><Skeleton className="h-7 w-24" /></TableCell>
              </TableRow>
            ))
          : items.map((row) => (
              <TableRow key={row.productId}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {row.imageUrl ? (
                      // Uploaded thumbnails are arbitrary sizes; next/image needs
                      // configured remote patterns, so a plain img is intentional.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded-lg border border-slate-100 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-400">
                        —
                      </span>
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/admin/products/${row.productId}`}
                        className="line-clamp-1 font-medium text-slate-900 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-slate-500 capitalize">{row.status}</p>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="font-mono text-xs text-slate-600">{row.sku}</TableCell>
                <TableCell className="text-slate-600">
                  {row.categoryName ?? "Uncategorised"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatCurrency(row.price)}</TableCell>

                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        row.stockStatus === "out"
                          ? "text-rose-600"
                          : row.stockStatus === "low"
                            ? "text-amber-600"
                            : "text-slate-900",
                      )}
                    >
                      {row.stock}
                    </span>
                    <span className="text-xs text-slate-400">
                      / threshold {row.lowStockThreshold}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <StockStatusBadge status={row.stockStatus} />
                </TableCell>

                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {formatDateTime(row.updatedAt)}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onAdjust(row)}
                      aria-label={`Adjust stock for ${row.name}`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                      Adjust
                    </Button>
                    <Link
                      href={`/admin/inventory/history?productId=${row.productId}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      aria-label={`View stock history for ${row.name}`}
                    >
                      <History className="h-3.5 w-3.5" aria-hidden />
                      History
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
