"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { CategoryFilters } from "@/hooks/use-category-list";
import { flattenCategories } from "./category-tree-select";
import type { AdminCategory } from "@/types/category";

export function CategoryFiltersBar({
  filters,
  categories,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: CategoryFilters;
  categories: AdminCategory[];
  onChange: (patch: Partial<CategoryFilters>) => void;
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
            placeholder="Search categories by name or slug…"
            aria-label="Search categories"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:w-auto">
          <Select
            value={filters.status}
            onChange={(event) =>
              onChange({ status: event.target.value as CategoryFilters["status"] })
            }
            aria-label="Filter by status"
            className="lg:w-40"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>

          <Select
            value={filters.parentId}
            onChange={(event) => onChange({ parentId: event.target.value })}
            aria-label="Filter by parent category"
            className="lg:w-48"
          >
            <option value="">All levels</option>
            <option value="root">Top-level only</option>
            {flattenCategories(categories).map((option) => (
              <option key={option.id} value={option.id}>
                {"\u00A0\u00A0".repeat(option.depth)}
                {option.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {total} categor{total === 1 ? "y" : "ies"}
          {hasActiveFilters ? " match the current filters" : " in total"}
        </span>
        <div className="flex items-center gap-3">
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          ) : null}
          <label className="flex items-center gap-1.5">
            Rows
            <Select
              value={String(filters.limit)}
              onChange={(event) => onChange({ limit: Number(event.target.value) })}
              aria-label="Rows per page"
              className="h-8 w-20 py-0 text-xs"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
    </div>
  );
}
