"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { reviewsService } from "@/services/admin/reviews.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  AdminReview,
  ReviewSortField,
  ReviewStatus,
  ReviewSummary,
} from "@/types/review";

export interface ReviewFilters {
  search: string;
  status: "" | ReviewStatus;
  rating: "" | "1" | "2" | "3" | "4" | "5";
  from: string;
  to: string;
  page: number;
  limit: number;
  sortBy: ReviewSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  search: "",
  status: "",
  rating: "",
  from: "",
  to: "",
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: AdminReview[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`).toISOString();
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`).toISOString();

/**
 * Server-paginated moderation queue plus the header cards.
 *
 * Same shape as the offers/customers lists: debounced search, page reset on filter
 * change, abortable requests, and `loading` derived from the settled query key so
 * the table never presents stale rows as current.
 */
export function useReviewList(initial: Partial<ReviewFilters> = {}) {
  const [filters, setFilters] = useState<ReviewFilters>({
    ...DEFAULT_REVIEW_FILTERS,
    ...initial,
  });
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>(INITIAL_STATE);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      SEARCH_DEBOUNCE_MS,
    );

    return () => clearTimeout(timer);
  }, [filters.search]);

  const query = useMemo(
    () => ({
      page: filters.page,
      limit: filters.limit,
      search: debouncedSearch || undefined,
      status: filters.status || undefined,
      rating: filters.rating ? Number(filters.rating) : undefined,
      from: filters.from ? startOfDay(filters.from) : undefined,
      to: filters.to ? endOfDay(filters.to) : undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
    [filters, debouncedSearch],
  );

  const queryKey = useMemo(
    () => `${JSON.stringify(query)}|${reloadToken}`,
    [query, reloadToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    reviewsService
      .list(query, controller.signal)
      .then((result) => {
        if (active) {
          setState({ key: queryKey, items: result.data, meta: result.meta, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState((previous) => ({
          key: queryKey,
          items: previous.items,
          meta: previous.meta,
          error: getApiErrorMessage(error),
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, queryKey]);

  // Cards describe the whole queue, so they ignore the filters.
  useEffect(() => {
    const controller = new AbortController();

    reviewsService
      .summary(controller.signal)
      .then((result) => {
        setSummary(result);
        setSummaryError(null);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setSummaryError(getApiErrorMessage(error));
        }
      });

    return () => controller.abort();
  }, [reloadToken]);

  const update = useCallback((patch: Partial<ReviewFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_REVIEW_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "" ||
    filters.rating !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  return {
    filters,
    update,
    reset,
    refresh,
    items: state.items,
    meta: state.meta,
    error: state.key === queryKey ? state.error : null,
    loading: state.key !== queryKey,
    hasActiveFilters,
    summary,
    summaryError,
  };
}
