"use client";

import { Search, X } from "lucide-react";
import { Select } from "@/components/admin/ui/select";
import { Input } from "@/components/admin/ui/input";
import type { ProductFilters } from "@/hooks/use-product-list";
import type { Category } from "@/types/product";

export function ProductFiltersBar({
  filters,
  categories,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: ProductFilters;
  categories: Category[];
  onChange: (patch: Partial<ProductFilters>) => void;
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
            placeholder="Search by name, SKU or slug…"
            aria-label="Search products"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto lg:grid-cols-3">
          <Select
            value={filters.category}
            onChange={(event) => onChange({ category: event.target.value })}
            aria-label="Filter by category"
            className="lg:w-40"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          <Select
            value={filters.status}
            onChange={(event) =>
              onChange({ status: event.target.value as ProductFilters["status"] })
            }
            aria-label="Filter by status"
            className="lg:w-36"
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>

          <Select
            value={filters.stockStatus}
            onChange={(event) =>
              onChange({
                stockStatus: event.target.value as ProductFilters["stockStatus"],
              })
            }
            aria-label="Filter by stock"
            className="lg:w-36"
          >
            <option value="">All stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {total} product{total === 1 ? "" : "s"}
          {hasActiveFilters ? " match the current filters" : " in the catalogue"}
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
