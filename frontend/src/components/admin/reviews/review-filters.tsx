"use client";

import { CalendarRange, Search, X } from "lucide-react";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { ReviewFilters } from "@/hooks/use-review-list";

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

export function ReviewFiltersBar({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: ReviewFilters;
  onChange: (patch: Partial<ReviewFilters>) => void;
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
            placeholder="Search customer, order number or review text…"
            aria-label="Search reviews"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:w-auto">
          <Select
            value={filters.status}
            onChange={(event) =>
              onChange({ status: event.target.value as ReviewFilters["status"] })
            }
            aria-label="Filter by moderation status"
            className="lg:w-40"
          >
            <option value="">All reviews</option>
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={filters.rating}
            onChange={(event) =>
              onChange({ rating: event.target.value as ReviewFilters["rating"] })
            }
            aria-label="Filter by star rating"
            className="lg:w-40"
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={String(stars)}>
                {stars} {stars === 1 ? "star" : "stars"}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
            Submitted between
          </span>
          <Input
            type="date"
            value={filters.from}
            onChange={(event) => onChange({ from: event.target.value })}
            aria-label="Reviews submitted from"
            className="w-40"
          />
          <span className="text-xs text-slate-400">and</span>
          <Input
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
            aria-label="Reviews submitted until"
            className="w-40"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {total} {total === 1 ? "review" : "reviews"}
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
