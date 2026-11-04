"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Truck } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import {
  useCourierOptions,
  useShipmentList,
  useShipmentSummary,
} from "@/hooks/use-shipment-list";
import type { ShipmentSortField, ShipmentStatus } from "@/types/shipment";
import { ShipmentCreateDialog } from "./shipment-create-dialog";
import { ShipmentSummaryCards } from "./shipment-summary-cards";
import { ShipmentsFiltersBar } from "./shipments-filters";
import { ShipmentsTable } from "./shipments-table";

/**
 * Shipping console.
 *
 * Statuses change only through validated transitions on the shipment detail page,
 * so this screen is a read model plus one action: create a parcel for an eligible
 * order. Nothing here can mark an order delivered.
 */
export function ShipmentsView() {
  const router = useRouter();
  const {
    filters,
    update,
    reset,
    refresh,
    items,
    meta,
    error,
    loading,
    hasActiveFilters,
  } = useShipmentList();
  const summary = useShipmentSummary();
  const couriers = useCourierOptions();
  const [creating, setCreating] = useState(false);

  const onSort = (field: ShipmentSortField) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc",
    });
  };

  const reloadAll = () => {
    refresh();
    summary.refresh();
  };

  const onCardSelect = (status: ShipmentStatus | null, delayedOnly = false) => {
    update({ status: status ?? "", delayedOnly });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shipping"
        description="Every parcel from packing to proof of delivery. Shipment statuses drive the order's fulfilment through legal transitions."
        actions={
          <>
            <Button variant="secondary" onClick={reloadAll}>
              Refresh
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PackagePlus className="mr-1.5 h-4 w-4" aria-hidden />
              Create shipment
            </Button>
          </>
        }
      />

      {couriers.options?.manualOnly ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
          Running in manual courier mode — no partner credentials are configured, so
          couriers and tracking numbers are entered by hand and nothing is invented.
        </p>
      ) : null}

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.refresh} />
      ) : (
        <ShipmentSummaryCards
          summary={summary.summary}
          loading={summary.loading}
          onSelect={onCardSelect}
        />
      )}

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Shipments"
          description="Search by shipment, order id, customer or tracking number."
          action={
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Truck className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              {couriers.options
                ? `${couriers.options.providers.filter((provider) => provider.enabled).length} partner${couriers.options.providers.filter((provider) => provider.enabled).length === 1 ? "" : "s"} available`
                : "Checking partners…"}
            </span>
          }
        />

        <ShipmentsFiltersBar
          filters={filters}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
          couriers={couriers.options?.providers ?? []}
        />

        {!loading && items.length === 0 && meta !== null ? (
          <div className="p-5">
            <EmptyState
              icon={Truck}
              title={
                hasActiveFilters
                  ? "No shipments match these filters"
                  : "No shipments yet"
              }
              description={
                hasActiveFilters
                  ? "Try a different search term, status, courier or date range."
                  : "Create a shipment for a confirmed or processing order and it will appear here."
              }
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" size="sm" onClick={reset}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    Create shipment
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <ShipmentsTable
            shipments={items}
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

      <ShipmentCreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(shipment) => {
          reloadAll();
          router.push(`/admin/shipping/${shipment.id}`);
        }}
      />
    </div>
  );
}
