// src/components/store/account/my-reviews.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ShoppingBag, Star } from "lucide-react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { cn, formatDate } from "@/lib/utils";
import { myReviewsService } from "@/services/store/my-reviews.service";
import type { PaginationMeta } from "@/types/auth";
import type { MyReview, ReviewStatus } from "@/types/review";

/**
 * Everything the customer has written, including reviews still waiting for approval.
 *
 * The status is shown rather than hidden: a "pending" badge answers the question
 * "did my review go through?" before the shopper has to email the store and ask.
 * A rejection shows the moderator's reason, which the API only exposes to the author
 * and to admins.
 */

const STATUS_STYLE: Record<ReviewStatus, { label: string; className: string }> = {
  approved: {
    label: "Published",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  pending: {
    label: "Awaiting approval",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  rejected: {
    label: "Not published",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const PAGE_SIZE = 10;

export function MyReviews() {
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    key: string;
    reviews: MyReview[];
    meta?: PaginationMeta;
    error: string | null;
  }>({ key: "", reviews: [], error: null });

  /*
   * Keyed by page + reload token so `loading` is derived rather than stored: the
   * effect fetches and never sets state synchronously.
   */
  const queryKey = `mine|${page}|${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    myReviewsService
      .list({ page, limit: PAGE_SIZE }, controller.signal)
      .then(({ data, meta: pageMeta }) => {
        if (active) {
          setState({ key: queryKey, reviews: data, meta: pageMeta, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState((previous) => ({
          ...previous,
          key: queryKey,
          error: getApiErrorMessage(error),
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page, queryKey]);

  const loading = state.key !== queryKey;
  const { reviews, meta, error } = state;

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-28 animate-pulse rounded-surface bg-cream-200" />
        ))}
      </div>
    );
  }

  if (error !== null) {
    return (
      <div role="alert" className="surface flex flex-col items-start gap-2 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-rose-700">
          <AlertCircle className="h-4 w-4" aria-hidden />
          We could not load your reviews
        </p>
        <p className="text-xs text-bark-500">{error}</p>
        <button
          type="button"
          onClick={() => setReloadToken((token) => token + 1)}
          className="mt-1 cursor-pointer rounded-control border border-bark-300 px-3 py-1.5 text-xs font-medium text-bark-900 hover:bg-cream-100"
        >
          Try again
        </button>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="surface flex flex-col items-center px-6 py-12 text-center">
        <ShoppingBag className="h-6 w-6 text-bark-300" aria-hidden />
        <p className="mt-3 text-sm font-medium text-bark-900">No reviews yet</p>
        <p className="mt-1 max-w-sm text-xs text-bark-500">
          Reviews unlock once an order has been delivered — open a delivered order and you
          can rate what arrived.
        </p>
        <Link
          href="/account/orders"
          className="mt-4 inline-flex items-center gap-1.5 rounded-control bg-baby-400 px-4 py-2 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
        >
          View my orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-bark-500">
        {meta ? `${meta.total} ${meta.total === 1 ? "review" : "reviews"}` : null}
        {" · "}
        Reviews appear on the product page once an administrator approves them.
      </p>

      <ul className="space-y-3">
        {reviews.map((review) => {
          const statusStyle = STATUS_STYLE[review.status];

          return (
            <li key={review.id} className="surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/products/${review.productSlug}`}
                    className="text-sm font-semibold text-bark-900 underline decoration-bark-300 underline-offset-4 hover:decoration-bark-900"
                  >
                    {review.productName}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-bark-500">
                    Order {review.orderNumber} · {formatDate(review.createdAt)}
                  </p>
                </div>

                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                    statusStyle.className,
                  )}
                >
                  {statusStyle.label}
                </span>
              </div>

              <p className="mt-2 flex items-center gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={cn(
                      "h-3.5 w-3.5",
                      star <= review.rating
                        ? "fill-baby-600 text-baby-600"
                        : "text-cream-400",
                    )}
                    aria-hidden
                  />
                ))}
                <span className="ml-1.5 text-[11px] text-bark-500">{review.ratingLabel}</span>
              </p>

              {review.title ? (
                <p className="mt-2 text-sm font-medium text-bark-900">{review.title}</p>
              ) : null}

              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-bark-700">
                {review.comment}
              </p>

              {review.status === "rejected" && review.moderationReason ? (
                <p className="mt-2 rounded-control border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">
                  Reason: {review.moderationReason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {meta && meta.totalPages > 1 ? (
        <nav
          aria-label="Review pages"
          className="flex items-center justify-between gap-3 border-t border-cream-300 pt-3 text-xs"
        >
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={!meta.hasPreviousPage}
            className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-cream-300 px-3 py-1.5 font-medium text-bark-800 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-bark-500">
            Page {meta.page} of {meta.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!meta.hasNextPage}
            className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-cream-300 px-3 py-1.5 font-medium text-bark-800 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
