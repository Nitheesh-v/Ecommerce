"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { CustomerFilters } from "@/hooks/use-customer-list";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "@/types/customer";

export function CustomersFiltersBar({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: CustomerFilters;
  onChange: (patch: Partial<CustomerFilters>) => void;
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
            placeholder="Search name, email or phone…"
            aria-label="Search customers"
            className="pl-9"
          />
        </div>

        <Select
          value={filters.status}
          onChange={(event) =>
            onChange({ status: event.target.value as "" | CustomerStatus })
          }
          aria-label="Filter by account status"
          className="xl:w-40"
        >
          <option value="">All statuses</option>
          {(Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[]).map((status) => (
            <option key={status} value={status}>
              {CUSTOMER_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>

        <Select
          value={sortValue}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split(":");
            onChange({
              sortBy: sortBy as CustomerFilters["sortBy"],
              sortOrder: sortOrder as "asc" | "desc",
            });
          }}
          aria-label="Sort customers"
          className="xl:w-52"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="netSpent:desc">Total spending (high → low)</option>
          <option value="netSpent:asc">Total spending (low → high)</option>
          <option value="name:asc">Name (A → Z)</option>
          <option value="name:desc">Name (Z → A)</option>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Joined
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => onChange({ from: event.target.value })}
              aria-label="Registered from"
              className="h-9 w-36 py-1"
            />
          </label>
          <span className="text-xs text-slate-400">→</span>
          <Input
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
            aria-label="Registered until"
            className="h-9 w-36 py-1"
          />

          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Spend ₹
            <Input
              type="number"
              min="0"
              value={filters.minSpent}
              onChange={(event) => onChange({ minSpent: event.target.value })}
              aria-label="Minimum spending in rupees"
              placeholder="min"
              className="h-9 w-24 py-1"
            />
          </label>
          <span className="text-xs text-slate-400">→</span>
          <Input
            type="number"
            min="0"
            value={filters.maxSpent}
            onChange={(event) => onChange({ maxSpent: event.target.value })}
            aria-label="Maximum spending in rupees"
            placeholder="max"
            className="h-9 w-24 py-1"
          />

          <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={filters.hasOrders}
              onChange={(event) => onChange({ hasOrders: event.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Has purchased
          </label>

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
          {total === 0 ? "No customers" : `${total} customer${total === 1 ? "" : "s"}`}
          {hasActiveFilters ? " matching these filters" : ""}
        </p>
      </div>
    </div>
  );
}
