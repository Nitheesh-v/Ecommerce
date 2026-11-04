"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { offersService } from "@/services/admin/coupons.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  AdminOffer,
  DiscountType,
  OfferLifecycleStatus,
  OfferSortField,
  OfferSummary,
} from "@/types/offer";

export interface OfferFilters {
  search: string;
  status: "" | OfferLifecycleStatus;
  type: "" | DiscountType;
  /** `YYYY-MM-DD` bounds on the offer window. */
  from: string;
  to: string;
  page: number;
  limit: number;
  sortBy: OfferSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_OFFER_FILTERS: OfferFilters = {
  search: "",
  status: "",
  type: "",
  from: "",
  to: "",
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: AdminOffer[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`).toISOString();
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`).toISOString();

/**
 * Server-paginated offer list plus the console stat cards.
 *
 * Follows the established list pattern: debounced search, page reset on filter
 * change, abortable requests, and `loading` derived from the settled query key so
 * the table never shows stale rows as "fresh".
 */
export function useOfferList(initial: Partial<OfferFilters> = {}) {
  const [filters, setFilters] = useState<OfferFilters>({
    ...DEFAULT_OFFER_FILTERS,
    ...initial,
  });
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>(INITIAL_STATE);
  const [summary, setSummary] = useState<OfferSummary | null>(null);
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
      type: filters.type || undefined,
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

    offersService
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

  // Cards are independent of the filters: they describe the whole console.
  useEffect(() => {
    const controller = new AbortController();

    offersService
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

  const update = useCallback((patch: Partial<OfferFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_OFFER_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "" ||
    filters.type !== "" ||
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
