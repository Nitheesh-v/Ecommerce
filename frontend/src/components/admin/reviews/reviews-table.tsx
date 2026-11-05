"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Check, MessageSquare, Trash2, X } from "lucide-react";
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
import type { ReviewFilters } from "@/hooks/use-review-list";
import { formatDateTime } from "@/lib/utils";
import type { AdminReview, ReviewSortField } from "@/types/review";
import type { ModerationAction } from "./moderation-dialog";
import { ReviewStatusBadge, StarRating } from "./review-status-badge";

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) {
    return <ArrowUp className="h-3 w-3 text-slate-300" aria-hidden />;
  }

  return order === "asc" ? (
    <ArrowUp className="h-3 w-3 text-slate-600" aria-hidden />
  ) : (
    <ArrowDown className="h-3 w-3 text-slate-600" aria-hidden />
  );
}

export function ReviewsTable({
  items,
  filters,
  loading,
  busyId,
  onSort,
  onAction,
}: {
  items: AdminReview[];
  filters: ReviewFilters;
  loading: boolean;
  busyId: string | null;
  onSort: (field: ReviewSortField) => void;
  onAction: (review: AdminReview, action: ModerationAction) => void;
}) {
  const sortable = (field: ReviewSortField, label: string) => (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1 hover:text-slate-800"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <SortIcon active={filters.sortBy === field} order={filters.sortOrder} />
    </button>
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{sortable("rating", "Rating")}</TableHeaderCell>
            <TableHeaderCell>Review</TableHeaderCell>
            <TableHeaderCell>Product</TableHeaderCell>
            <TableHeaderCell>Customer</TableHeaderCell>
            <TableHeaderCell>{sortable("createdAt", "Submitted")}</TableHeaderCell>
            <TableHeaderCell>{sortable("status", "Status")}</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && items.length === 0
            ? Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {Array.from({ length: 7 }).map((__, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : items.map((review) => (
                <TableRow key={review.id}>
                  <TableCell className="align-top">
                    <StarRating rating={review.rating} />
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {review.ratingLabel}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[320px] align-top">
                    <p className="font-medium text-slate-900">
                      {review.title ?? "Untitled review"}
                    </p>
                    <p className="line-clamp-2 text-xs text-slate-600">{review.comment}</p>
                    {review.moderationReason ? (
                      <p className="mt-1 text-xs text-rose-600">
                        Rejected: {review.moderationReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    {review.productSlug ? (
                      <Link
                        href={`/products/${review.productSlug}`}
                        className="font-medium text-slate-800 hover:text-indigo-600"
                      >
                        {review.productName}
                      </Link>
                    ) : (
                      <span className="text-slate-600">{review.productName}</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <p className="text-slate-800">{review.customerName}</p>
                    <p className="text-xs text-slate-500">{review.customerEmail}</p>
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap text-slate-600">
                    {formatDateTime(review.createdAt)}
                    <span className="mt-0.5 block text-xs text-slate-400">
                      Order {review.orderNumber}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <ReviewStatusBadge status={review.status} label={review.statusLabel} />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === review.id || review.status === "approved"}
                        onClick={() => onAction(review, "approve")}
                        aria-label={`Approve review by ${review.customerName}`}
                      >
                        <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === review.id || review.status === "rejected"}
                        onClick={() => onAction(review, "reject")}
                        aria-label={`Reject review by ${review.customerName}`}
                      >
                        <X className="h-4 w-4 text-amber-600" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === review.id}
                        onClick={() => onAction(review, "delete")}
                        aria-label={`Delete review by ${review.customerName}`}
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>

      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
          <MessageSquare className="h-5 w-5 text-slate-300" aria-hidden />
          <p className="text-sm font-medium text-slate-700">No reviews here</p>
          <p className="text-xs text-slate-500">
            Reviews arrive once a customer with a delivered order writes one.
          </p>
        </div>
      ) : null}
    </div>
  );
}
