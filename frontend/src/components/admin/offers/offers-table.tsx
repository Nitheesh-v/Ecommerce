"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Pause, Pencil, Play, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Skeleton } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import type { OfferFilters } from "@/hooks/use-offer-list";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AdminOffer, OfferSortField } from "@/types/offer";
import { OfferStatusBadge } from "./offer-status-badge";

const COLUMNS: Array<{ key: OfferSortField | null; label: string; sortable: boolean }> = [
  { key: "name", label: "Offer", sortable: true },
  { key: null, label: "Coupon code", sortable: false },
  { key: null, label: "Discount", sortable: false },
  { key: null, label: "Value", sortable: false },
  { key: "startsAt", label: "Starts", sortable: true },
  { key: "endsAt", label: "Expires", sortable: true },
  { key: "usageCount", label: "Usage", sortable: true },
  { key: null, label: "Status", sortable: false },
  { key: null, label: "Actions", sortable: false },
];

function SortIcon({
  active,
  order,
}: {
  active: boolean;
  order: "asc" | "desc";
}) {
  if (!active) {
    return <ArrowUp className="h-3 w-3 text-slate-300" aria-hidden />;
  }

  return order === "asc" ? (
    <ArrowUp className="h-3 w-3 text-slate-600" aria-hidden />
  ) : (
    <ArrowDown className="h-3 w-3 text-slate-600" aria-hidden />
  );
}

export function OffersTable({
  items,
  filters,
  loading,
  busyId,
  onSort,
  onToggleStatus,
  onArchive,
}: {
  items: AdminOffer[];
  filters: OfferFilters;
  loading: boolean;
  busyId: string | null;
  onSort: (field: OfferSortField) => void;
  onToggleStatus: (offer: AdminOffer) => void;
  onArchive: (offer: AdminOffer) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHead>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHeaderCell key={column.label}>
                {column.sortable && column.key ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.key as OfferSortField)}
                    className="inline-flex items-center gap-1 hover:text-slate-800"
                    aria-label={`Sort by ${column.label}`}
                  >
                    {column.label}
                    <SortIcon
                      active={filters.sortBy === column.key}
                      order={filters.sortOrder}
                    />
                  </button>
                ) : (
                  column.label
                )}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && items.length === 0
            ? Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {COLUMNS.map((column) => (
                    <TableCell key={column.label}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : items.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/offers/${offer.id}/edit`}
                        className="truncate font-medium text-slate-900 hover:text-indigo-600"
                      >
                        {offer.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {offer.perCustomerLimit === 1
                          ? "1 use per customer"
                          : `${offer.perCustomerLimit} uses per customer`}
                        {offer.remainingUses === null
                          ? " · unlimited total"
                          : ` · ${offer.remainingUses} left`}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-slate-700">
                      {offer.code}
                    </code>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {offer.typeLabel}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium text-slate-800">
                    {offer.valueLabel}
                    {offer.maxDiscount !== null ? (
                      <span className="block text-xs font-normal text-slate-500">
                        cap {formatCurrency(offer.maxDiscount)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatDate(offer.startsAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatDate(offer.endsAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {offer.usageCount}
                    <span className="text-slate-400"> / {offer.totalUsageLimit ?? "∞"}</span>
                  </TableCell>
                  <TableCell>
                    <OfferStatusBadge status={offer.status} label={offer.statusLabel} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link href={`/admin/offers/${offer.id}/edit`}>
                        <Button variant="ghost" size="sm" aria-label={`Edit ${offer.name}`}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                      </Link>
                      <Link href={`/admin/offers/${offer.id}/redemptions`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Redemptions for ${offer.name}`}
                        >
                          <Receipt className="h-4 w-4" aria-hidden />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === offer.id}
                        onClick={() => onToggleStatus(offer)}
                        aria-label={
                          offer.isActive ? `Pause ${offer.name}` : `Resume ${offer.name}`
                        }
                      >
                        {offer.isActive ? (
                          <Pause className="h-4 w-4" aria-hidden />
                        ) : (
                          <Play className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === offer.id || !offer.isActive}
                        onClick={() => onArchive(offer)}
                        aria-label={`Archive ${offer.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
