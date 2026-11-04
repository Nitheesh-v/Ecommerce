"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { OrderFilters } from "@/hooks/use-order-list";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/types/order";

export function OrdersFiltersBar({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: OrderFilters;
  onChange: (patch: Partial<OrderFilters>) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  total: number;
}) {
  const sortValue = `${filters.sortBy}:${filters.sortOrder}`;

  return (
    <div className="space-y-3 border-b border-slate-100 px-5 py-3">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search order number, customer name or email…"
            aria-label="Search orders"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:w-auto xl:grid-cols-3">
          <Select
            value={filters.status}
            onChange={(event) =>
              onChange({ status: event.target.value as "" | OrderStatus })
            }
            aria-label="Filter by order status"
            className="xl:w-40"
          >
            <option value="">All statuses</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>

          <Select
            value={filters.paymentStatus}
            onChange={(event) =>
              onChange({ paymentStatus: event.target.value as "" | PaymentStatus })
            }
            aria-label="Filter by payment status"
            className="xl:w-40"
          >
            <option value="">All payments</option>
            {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>

          <Select
            value={filters.paymentMethod}
            onChange={(event) =>
              onChange({ paymentMethod: event.target.value as "" | PaymentMethod })
            }
            aria-label="Filter by payment method"
            className="xl:w-44"
          >
            <option value="">All methods</option>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            From
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => onChange({ from: event.target.value })}
              aria-label="Orders placed from"
              className="h-9 w-36 py-1"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            To
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => onChange({ to: event.target.value })}
              aria-label="Orders placed until"
              className="h-9 w-36 py-1"
            />
          </label>

          <Select
            value={sortValue}
            onChange={(event) => {
              const [sortBy, sortOrder] = event.target.value.split(":");
              onChange({
                sortBy: sortBy as OrderFilters["sortBy"],
                sortOrder: sortOrder as "asc" | "desc",
              });
            }}
            aria-label="Sort orders"
            className="h-9 w-44 py-1"
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="total:desc">Total (high → low)</option>
            <option value="total:asc">Total (low → high)</option>
          </Select>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">
          {total === 0 ? "No orders" : `${total} order${total === 1 ? "" : "s"}`}
          {hasActiveFilters ? " matching these filters" : ""}
        </p>
      </div>
    </div>
  );
}
