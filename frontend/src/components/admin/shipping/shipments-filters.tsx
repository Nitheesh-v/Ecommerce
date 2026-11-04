"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { ShipmentFilters } from "@/hooks/use-shipment-list";
import {
  COURIER_PROVIDER_LABELS,
  SHIPMENT_STATUS_OPTIONS,
  type CourierProvider,
  type ShipmentStatus,
} from "@/types/shipment";

/**
 * Search, status/courier filters, date range, delayed toggle and sort.
 *
 * The sort select writes the same two fields as the clickable column headers, so
 * a header arrow can never disagree with the select.
 */
export function ShipmentsFiltersBar({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
  total,
  couriers,
}: {
  filters: ShipmentFilters;
  onChange: (patch: Partial<ShipmentFilters>) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  total: number;
  couriers: CourierProvider[];
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
            placeholder="Search shipment, order id, customer, tracking number…"
            aria-label="Search shipments"
            className="pl-9"
          />
        </div>

        <Select
          value={filters.status}
          onChange={(event) =>
            onChange({ status: event.target.value as "" | ShipmentStatus })
          }
          aria-label="Filter by delivery status"
          className="xl:w-44"
        >
          <option value="">All statuses</option>
          {SHIPMENT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={filters.courier}
          onChange={(event) => onChange({ courier: event.target.value })}
          aria-label="Filter by courier"
          className="xl:w-52"
        >
          <option value="">All couriers</option>
          {couriers.map((courier) => (
            <option key={courier.id} value={courier.id}>
              {COURIER_PROVIDER_LABELS[courier.id] ?? courier.name}
            </option>
          ))}
        </Select>

        <Select
          value={sortValue}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split(":");
            onChange({
              sortBy: sortBy as ShipmentFilters["sortBy"],
              sortOrder: sortOrder as "asc" | "desc",
            });
          }}
          aria-label="Sort shipments"
          className="xl:w-60"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="estimatedDelivery:asc">Promised date (soonest)</option>
          <option value="estimatedDelivery:desc">Promised date (latest)</option>
          <option value="status:asc">Status (A → Z)</option>
          <option value="status:desc">Status (Z → A)</option>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Shipped
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => onChange({ from: event.target.value })}
              aria-label="Shipments created from"
              className="h-9 w-36 py-1"
            />
          </label>
          <span className="text-xs text-slate-400">→</span>
          <Input
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
            aria-label="Shipments created until"
            className="h-9 w-36 py-1"
          />

          <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={filters.delayedOnly}
              onChange={(event) => onChange({ delayedOnly: event.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
            />
            Delayed only
          </label>

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">
          {total} shipment{total === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
