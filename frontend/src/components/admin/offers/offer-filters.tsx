"use client";

import { CalendarRange, Search, X } from "lucide-react";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { OfferFilters } from "@/hooks/use-offer-list";
import type { DiscountType, OfferLifecycleStatus } from "@/types/offer";

const STATUSES: Array<{ value: OfferLifecycleStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Exhausted" },
  { value: "inactive", label: "Inactive" },
];

const TYPES: Array<{ value: DiscountType; label: string }> = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed amount" },
  { value: "free_shipping", label: "Free shipping" },
];

export function OfferFiltersBar({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: OfferFilters;
  onChange: (patch: Partial<OfferFilters>) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  total: number;
}) {
  return (
    <div className="space-y-3 border-b border-slate-100 px-5 py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search offers by name or coupon code…"
            aria-label="Search offers"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:w-auto">
          <Select
            value={filters.status}
            onChange={(event) =>
              onChange({ status: event.target.value as OfferFilters["status"] })
            }
            aria-label="Filter by status"
            className="lg:w-40"
          >
            <option value="">All statuses</option>
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={filters.type}
            onChange={(event) =>
              onChange({ type: event.target.value as OfferFilters["type"] })
            }
            aria-label="Filter by discount type"
            className="lg:w-44"
          >
            <option value="">All discount types</option>
            {TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
            Running between
          </span>
          <Input
            type="date"
            value={filters.from}
            onChange={(event) => onChange({ from: event.target.value })}
            aria-label="Offers running from"
            className="w-40"
          />
          <span className="text-xs text-slate-400">and</span>
          <Input
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
            aria-label="Offers running until"
            className="w-40"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {total} {total === 1 ? "offer" : "offers"}
          </span>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
