"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { InventoryFilters } from "@/hooks/use-inventory-list";
import type { Category } from "@/types/product";
import type { StockSortField } from "@/types/inventory";

/** Sort options are encoded as `field:order` so one select controls both. */
const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "quantity:asc", label: "Lowest stock first" },
  { value: "quantity:desc", label: "Highest stock first" },
  { value: "name:asc", label: "Name (A–Z)" },
  { value: "name:desc", label: "Name (Z–A)" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "price:desc", label: "Price (high → low)" },
  { value: "price:asc", label: "Price (low → high)" },
];

export function InventoryFiltersBar({
  filters,
  categories,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: InventoryFilters;
  categories: Category[];
  onChange: (patch: Partial<InventoryFilters>) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  total: number;
}) {
  const sortValue = `${filters.sortBy}:${filters.sortOrder}`;

  const onSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split(":");
    onChange({
      sortBy: sortBy as StockSortField,
      sortOrder: sortOrder as "asc" | "desc",
    });
  };

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
            placeholder="Search by product name or SKU…"
            aria-label="Search inventory by name or SKU"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:w-auto xl:grid-cols-3">
          <Select
            value={filters.categoryId}
            onChange={(event) => onChange({ categoryId: event.target.value })}
            aria-label="Filter by category"
            className="xl:w-40"
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
              onChange({ status: event.target.value as InventoryFilters["status"] })
            }
            aria-label="Filter by stock status"
            className="xl:w-36"
          >
            <option value="">All stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>

          <Select
            value={sortValue}
            onChange={(event) => onSortChange(event.target.value)}
            aria-label="Sort inventory"
            className="xl:w-48"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {total === 0 ? "No products" : `${total} product${total === 1 ? "" : "s"}`}
          {hasActiveFilters ? " matching these filters" : " tracked"}
        </p>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
