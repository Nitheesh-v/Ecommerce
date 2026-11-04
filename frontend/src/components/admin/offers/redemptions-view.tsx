"use client";

import Link from "next/link";
import { ArrowLeft, Download, Receipt } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { Select } from "@/components/admin/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { useRedemptionList } from "@/hooks/use-redemption-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { offersService } from "@/services/admin/coupons.service";
import { toast } from "@/store/toast.store";
import type { RedemptionStatus } from "@/types/offer";
import { RedemptionStatusBadge } from "./offer-status-badge";

const STATUSES: Array<{ value: RedemptionStatus; label: string }> = [
  { value: "reserved", label: "Reserved" },
  { value: "redeemed", label: "Redeemed" },
  { value: "reversed", label: "Reversed" },
];

/**
 * Redemption ledger.
 *
 * A reservation appears the moment an order is placed, flips to `redeemed` when
 * that order is confirmed, and to `reversed` when it is cancelled or returned — so
 * this list is the audit trail of every coupon use, not a live cart view.
 */
export function RedemptionsView({
  offerId,
  offerName,
}: {
  offerId?: string;
  offerName?: string;
}) {
  const { filters, update, reset, refresh, items, meta, error, loading } =
    useRedemptionList({}, offerId);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);

    try {
      const file = await offersService.exportRedemptions({
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        offerId,
        from: filters.from || undefined,
        to: filters.to || undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });

      toast.success(`Exported ${file}`);
    } catch (error_) {
      toast.error(getApiErrorMessage(error_));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={offerName ? `Redemptions · ${offerName}` : "Coupon redemptions"}
        description="Reserved at checkout, finalised on confirmation, reversed on cancellation or return."
        actions={
          <>
            <Link href={offerId ? `/admin/offers/${offerId}/edit` : "/admin/offers"}>
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {offerId ? "Back to offer" : "Back to offers"}
              </Button>
            </Link>
            <Button onClick={() => void exportCsv()} disabled={exporting}>
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-slate-100 px-5 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              type="search"
              value={filters.search}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Search by coupon code, order number or customer email…"
              aria-label="Search redemptions"
              className="min-w-0 flex-1"
            />

            <div className="grid grid-cols-2 gap-2 lg:w-auto">
              <Select
                value={filters.status}
                onChange={(event) =>
                  update({
                    status: event.target.value as typeof filters.status,
                  })
                }
                aria-label="Filter by redemption status"
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
                value={filters.sortBy}
                onChange={(event) =>
                  update({
                    sortBy: event.target.value as typeof filters.sortBy,
                  })
                }
                aria-label="Sort redemptions"
                className="lg:w-44"
              >
                <option value="reservedAt">Newest first</option>
                <option value="redeemedAt">By redemption date</option>
                <option value="discountAmount">By discount</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => update({ from: event.target.value })}
              aria-label="Reserved from"
              className="w-40"
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => update({ to: event.target.value })}
              aria-label="Reserved until"
              className="w-40"
            />
            <button
              type="button"
              onClick={reset}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Reset
            </button>
            <span className="ml-auto text-xs text-slate-500">
              {meta?.total ?? 0} {meta?.total === 1 ? "redemption" : "redemptions"}
            </span>
          </div>
        </div>

        {!loading && items.length === 0 && meta !== null ? (
          <div className="p-5">
            <EmptyState
              icon={Receipt}
              title="No redemptions yet"
              description="A row appears as soon as an order is placed with a coupon."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Coupon</TableHeaderCell>
                  <TableHeaderCell>Customer</TableHeaderCell>
                  <TableHeaderCell>Order</TableHeaderCell>
                  <TableHeaderCell>Discount</TableHeaderCell>
                  <TableHeaderCell>Reserved</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        {Array.from({ length: 6 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : items.map((redemption) => (
                      <TableRow key={redemption.redemptionId}>
                        <TableCell>
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-slate-700">
                            {redemption.code}
                          </code>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {redemption.customerEmail}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {redemption.orderId ? (
                            <Link
                              href={`/admin/orders/${redemption.orderId}`}
                              className="font-medium text-slate-800 hover:text-indigo-600"
                            >
                              {redemption.orderNumber ?? redemption.orderId}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium text-slate-800">
                          {redemption.freeShipping
                            ? "Free shipping"
                            : formatCurrency(redemption.discountAmount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-slate-600">
                          {formatDateTime(redemption.reservedAt)}
                        </TableCell>
                        <TableCell>
                          <RedemptionStatusBadge
                            status={redemption.status}
                            label={redemption.statusLabel}
                          />
                          {redemption.reversalReason ? (
                            <p className="mt-0.5 max-w-[200px] truncate text-xs text-slate-500">
                              {redemption.reversalReason}
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        )}

        {meta ? (
          <Pagination
            meta={meta}
            disabled={loading}
            onPageChange={(page) => update({ page })}
          />
        ) : null}
      </Card>
    </div>
  );
}
