"use client";

import Link from "next/link";
import { Download, Loader2, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import { useOrderList } from "@/hooks/use-order-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { ordersService } from "@/services/admin/orders.service";
import { toast } from "@/store/toast.store";
import type { Order } from "@/types/order";
import { OrdersFiltersBar } from "./orders-filters";
import { OrdersTable } from "./orders-table";

const CSV_HEADERS = [
  "Order number",
  "Customer",
  "Email",
  "Placed at",
  "Items",
  "Subtotal",
  "Discount",
  "Shipping",
  "Tax",
  "Total",
  "Payment method",
  "Payment status",
  "Order status",
];

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function OrdersView() {
  const { filters, update, reset, refresh, items, meta, error, loading, hasActiveFilters } =
    useOrderList();
  const [exporting, setExporting] = useState(false);

  const onSort = (field: typeof filters.sortBy) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc",
    });
  };

  /** Exports the filtered set (every page), fetched from the API — never from UI state. */
  const onExport = async () => {
    setExporting(true);

    try {
      const rows: Order[] = [];
      let page = 1;
      let total = 0;

      do {
        const result = await ordersService.list({
          page,
          limit: 100,
          search: filters.search || undefined,
          status: filters.status || undefined,
          paymentStatus: filters.paymentStatus || undefined,
          paymentMethod: filters.paymentMethod || undefined,
          from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
          to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
        });

        rows.push(...result.data);
        total = result.meta.total;
        page += 1;
      } while (rows.length < total);

      const csv = [
        CSV_HEADERS,
        ...rows.map((order) => [
          order.orderNumber,
          order.customerName,
          order.customerEmail,
          new Date(order.createdAt).toISOString(),
          order.itemCount,
          order.subtotal,
          order.discountTotal + order.couponDiscount,
          order.shippingCharge,
          order.taxAmount,
          order.total,
          order.paymentMethod,
          order.paymentStatus,
          order.status,
        ]),
      ]
        .map((line) => line.map(csvCell).join(","))
        .join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length} order${rows.length === 1 ? "" : "s"}`);
    } catch (error_) {
      toast.error(getApiErrorMessage(error_));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orders"
        description="Every order, its payment state and where it is in fulfilment."
        actions={
          <Button variant="secondary" onClick={onExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Export CSV
          </Button>
        }
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <OrdersFiltersBar
          filters={filters}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {!loading && items.length === 0 && meta !== null && hasActiveFilters ? (
          <div className="p-5">
            <EmptyState
              icon={ShoppingCart}
              title="No orders match these filters"
              description="Try a different search term, status or date range."
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
              icon={ShoppingCart}
              title="No orders yet"
              description="Orders placed through the storefront — or created manually from the API — appear here."
              action={
                <Link href="/admin/products" className="mt-2 block">
                  <Button size="sm">Browse products</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <OrdersTable
            items={items}
            loading={loading}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onSort={onSort}
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
    </div>
  );
}
