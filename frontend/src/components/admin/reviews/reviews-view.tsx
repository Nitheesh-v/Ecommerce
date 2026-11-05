"use client";

import {
  CheckCircle2,
  MessageSquare,
  ShieldCheck,
  Star,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { useReviewList } from "@/hooks/use-review-list";
import type { AdminReview, ReviewSortField } from "@/types/review";
import { ModerationDialog, type ModerationAction } from "./moderation-dialog";
import { ReviewFiltersBar } from "./review-filters";
import { ReviewsTable } from "./reviews-table";

const STAT_CARDS = [
  { key: "total", label: "Total reviews", icon: MessageSquare, tone: "text-slate-700" },
  { key: "pending", label: "Awaiting moderation", icon: ShieldCheck, tone: "text-amber-600" },
  { key: "approved", label: "Published", icon: CheckCircle2, tone: "text-emerald-600" },
  { key: "rejected", label: "Rejected", icon: XCircle, tone: "text-rose-600" },
] as const;

export function ReviewsView() {
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
  } = useReviewList();

  const [busyId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    review: AdminReview;
    action: ModerationAction;
  } | null>(null);

  const onSort = (field: ReviewSortField) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc",
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reviews & ratings"
        description="Verified-buyer reviews wait here until you publish them."
        actions={
          summary && summary.pending > 0 ? (
            <Button
              variant="secondary"
              onClick={() => update({ status: "pending", rating: "", search: "" })}
            >
              {summary.pending} awaiting review
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryError ? (
          <Card className="p-4 sm:col-span-2 xl:col-span-5">
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
                <p className="text-xs font-medium text-slate-500">Average rating</p>
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              </div>
              {summary ? (
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {summary.averageRating === null ? "—" : summary.averageRating.toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    / 5 · {summary.approved} published
                  </span>
                </p>
              ) : (
                <Skeleton className="mt-2 h-7 w-16" />
              )}
            </Card>
          </>
        )}
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <ReviewFiltersBar
          filters={filters}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {!loading && items.length === 0 && meta !== null && hasActiveFilters ? (
          <div className="p-5">
            <EmptyState
              icon={MessageSquare}
              title="No reviews match these filters"
              description="Try another status, star rating or date range."
              action={
                <Button variant="secondary" size="sm" onClick={reset} className="mt-2">
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <ReviewsTable
            items={items}
            filters={filters}
            loading={loading}
            busyId={busyId}
            onSort={onSort}
            onAction={(review, action) => setPending({ review, action })}
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

      <ModerationDialog
        review={pending?.review ?? null}
        action={pending?.action ?? null}
        onClose={() => setPending(null)}
        onDone={refresh}
      />
    </div>
  );
}
