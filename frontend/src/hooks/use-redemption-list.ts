"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { offersService } from "@/services/admin/coupons.service";
import type { PaginationMeta } from "@/types/auth";
import type { CouponRedemption, RedemptionStatus } from "@/types/offer";

export interface RedemptionFilters {
  search: string;
  status: "" | RedemptionStatus;
  offerId: string;
  from: string;
  to: string;
  page: number;
  limit: number;
  sortBy: "reservedAt" | "redeemedAt" | "discountAmount";
  sortOrder: "asc" | "desc";
}

export const DEFAULT_REDEMPTION_FILTERS: RedemptionFilters = {
  search: "",
  status: "",
  offerId: "",
  from: "",
  to: "",
  page: 1,
  limit: 20,
  sortBy: "reservedAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: CouponRedemption[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`).toISOString();
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`).toISOString();

/**
 * Server-paginated redemption ledger.
 *
 * `forOfferId` pins the list to a single offer (used from the offer detail page);
 * otherwise it reads the store-wide ledger.
 */
export function useRedemptionList(
  initial: Partial<RedemptionFilters> = {},
  forOfferId?: string,
) {
  const [filters, setFilters] = useState<RedemptionFilters>({
    ...DEFAULT_REDEMPTION_FILTERS,
    ...initial,
  });
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>(INITIAL_STATE);

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
      offerId: forOfferId ?? (filters.offerId || undefined),
      from: filters.from ? startOfDay(filters.from) : undefined,
      to: filters.to ? endOfDay(filters.to) : undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
    [filters, debouncedSearch, forOfferId],
  );

  const queryKey = useMemo(
    () => `${JSON.stringify(query)}|${reloadToken}`,
    [query, reloadToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const request = forOfferId
      ? offersService.redemptionsForOffer(
          forOfferId,
          {
            page: query.page,
            limit: query.limit,
            search: query.search,
            status: query.status,
            from: query.from,
            to: query.to,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
          controller.signal,
        )
      : offersService.redemptions(query, controller.signal);

    request
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
  }, [query, queryKey, forOfferId]);

  const update = useCallback((patch: Partial<RedemptionFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_REDEMPTION_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    filters,
    update,
    reset,
    refresh,
    items: state.items,
    meta: state.meta,
    error: state.key === queryKey ? state.error : null,
    loading: state.key !== queryKey,
  };
}
