"use client";

import Link from "next/link";
import {
  BadgePercent,
  CalendarClock,
  CalendarX2,
  Plus,
  Receipt,
  Ticket,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { Dialog } from "@/components/admin/ui/dialog";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { useOfferList } from "@/hooks/use-offer-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/utils";
import { offersService } from "@/services/admin/coupons.service";
import { toast } from "@/store/toast.store";
import type { AdminOffer, OfferSortField } from "@/types/offer";
import { OfferFiltersBar } from "./offer-filters";
import { OffersTable } from "./offers-table";

const STAT_CARDS = [
  { key: "totalOffers", label: "Total offers", icon: Ticket, tone: "text-slate-700" },
  { key: "activeOffers", label: "Active", icon: BadgePercent, tone: "text-emerald-600" },
  { key: "scheduledOffers", label: "Scheduled", icon: CalendarClock, tone: "text-sky-600" },
  { key: "expiredOffers", label: "Expired", icon: CalendarX2, tone: "text-slate-500" },
  { key: "totalRedemptions", label: "Coupon redemptions", icon: Receipt, tone: "text-indigo-600" },
] as const;

export function OffersView() {
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
    summary,
    summaryError,
  } = useOfferList();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<AdminOffer | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const onSort = (field: OfferSortField) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc",
    });
  };

  const onToggleStatus = async (offer: AdminOffer) => {
    setBusyId(offer.id);

    try {
      await offersService.changeStatus(offer.id, !offer.isActive);
      toast.success(
        offer.isActive ? `“${offer.name}” paused` : `“${offer.name}” is live again`,
      );
      refresh();
    } catch (error_) {
      toast.error(getApiErrorMessage(error_));
    } finally {
      setBusyId(null);
    }
  };

  const confirmArchive = async () => {
    if (!pendingArchive) {
      return;
    }

    setArchiving(true);
    setArchiveError(null);

    try {
      await offersService.archive(pendingArchive.id);
      toast.success(`“${pendingArchive.name}” archived`);
      setPendingArchive(null);
      refresh();
    } catch (error_) {
      setArchiveError(getApiErrorMessage(error_));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Offers & coupons"
        description="Run percentage, fixed-amount and free-shipping coupons with usage limits."
        actions={
          <>
            <Link href="/admin/offers/redemptions">
              <Button variant="secondary">
                <Receipt className="h-4 w-4" aria-hidden />
                Redemptions
              </Button>
            </Link>
            <Link href="/admin/offers/create">
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                New offer
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryError ? (
          <Card className="p-4 sm:col-span-2 xl:col-span-6">
            <p className="text-sm text-rose-600">{summaryError}</p>
          </Card>
        ) : (
          <>
            {STAT_CARDS.map((stat) => (
              <Card key={stat.key} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                  <stat.icon className={`h-4 w-4 ${stat.tone}`} aria-hidden />
                </div>
                {summary ? (
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {summary[stat.key]}
                  </p>
                ) : (
                  <Skeleton className="mt-2 h-7 w-12" />
                )}
              </Card>
            ))}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Discount given</p>
                <Wallet className="h-4 w-4 text-amber-600" aria-hidden />
              </div>
              {summary ? (
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatCurrency(summary.totalDiscountGiven)}
                </p>
              ) : (
                <Skeleton className="mt-2 h-7 w-20" />
              )}
            </Card>
          </>
        )}
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <OfferFiltersBar
          filters={filters}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {!loading && items.length === 0 && meta !== null && hasActiveFilters ? (
          <div className="p-5">
            <EmptyState
              icon={Ticket}
              title="No offers match these filters"
              description="Try another code, status, discount type or date range."
              action={
                <Button variant="secondary" size="sm" onClick={reset} className="mt-2">
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : !loading && items.length === 0 && meta !== null ? (
          <div className="p-5">
            <EmptyState
              icon={Ticket}
              title="No offers yet"
              description="Create your first coupon so customers can save at checkout."
              action={
                <Link href="/admin/offers/create" className="mt-2">
                  <Button size="sm">
                    <Plus className="h-4 w-4" aria-hidden />
                    New offer
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <OffersTable
            items={items}
            filters={filters}
            loading={loading}
            busyId={busyId}
            onSort={onSort}
            onToggleStatus={(offer) => void onToggleStatus(offer)}
            onArchive={setPendingArchive}
          />
        )}

        {meta ? (
          <Pagination
            meta={meta}
            disabled={loading}
            onPageChange={(page) => update({ page })}
          />
        ) : null}
      </Card>

      <Dialog
        open={pendingArchive !== null}
        onClose={() => {
          setPendingArchive(null);
          setArchiveError(null);
        }}
        title="Archive this offer?"
        description={
          pendingArchive
            ? `“${pendingArchive.name}” stops working immediately and disappears from /offers. Orders that already used it keep their discount, and its history stays in the redemption ledger.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setPendingArchive(null)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmArchive()} disabled={archiving}>
              {archiving ? "Archiving…" : "Archive offer"}
            </Button>
          </>
        }
      >
        {archiveError ? (
          <p className="text-sm text-rose-600" role="alert">
            {archiveError}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
