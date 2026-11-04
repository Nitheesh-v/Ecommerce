"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { PaymentFilters } from "@/hooks/use-payment-list";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  type PaymentMethod,
  type PaymentStatus,
} from "@/types/payment";

/**
 * Search, status/method filters, date range and sort.
 *
 * The sort control mirrors the clickable column headers: both write the same two
 * fields, so the table never shows a header arrow that disagrees with the select.
 */
export function PaymentsFiltersBar({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: PaymentFilters;
  onChange: (patch: Partial<PaymentFilters>) => void;
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
            placeholder="Search transaction, order id, customer…"
            aria-label="Search transactions"
            className="pl-9"
          />
        </div>

        <Select
          value={filters.status}
          onChange={(event) =>
            onChange({ status: event.target.value as "" | PaymentStatus })
          }
          aria-label="Filter by payment status"
          className="xl:w-44"
        >
          <option value="">All statuses</option>
          {PAYMENT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={filters.method}
          onChange={(event) =>
            onChange({ method: event.target.value as "" | PaymentMethod })
          }
          aria-label="Filter by payment method"
          className="xl:w-44"
        >
          <option value="">All methods</option>
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={sortValue}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split(":");
            onChange({
              sortBy: sortBy as PaymentFilters["sortBy"],
              sortOrder: sortOrder as "asc" | "desc",
            });
          }}
          aria-label="Sort transactions"
          className="xl:w-56"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="amount:desc">Amount (high → low)</option>
          <option value="amount:asc">Amount (low → high)</option>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Paid
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => onChange({ from: event.target.value })}
              aria-label="Transactions from"
              className="h-9 w-36 py-1"
            />
          </label>
          <span className="text-xs text-slate-400">→</span>
          <Input
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
            aria-label="Transactions until"
            className="h-9 w-36 py-1"
          />

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">
          {total} transaction{total === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
