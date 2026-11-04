"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { inventoryService } from "@/services/admin/inventory.service";
import type { PaginationMeta } from "@/types/auth";
import type { MovementType, StockMovement } from "@/types/inventory";

export interface HistoryFilters {
  search: string;
  type: "" | MovementType;
  /** Optional deep-link from the inventory table: one product's movements. */
  productId: string;
  page: number;
  limit: number;
}

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  search: "",
  type: "",
  productId: "",
  page: 1,
  limit: 20,
};

interface HistoryState {
  key: string;
  items: StockMovement[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: HistoryState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

/** Server-paginated stock movement audit trail. */
export function useStockHistory(initial: Partial<HistoryFilters> = {}) {
  const [filters, setFilters] = useState<HistoryFilters>({
    ...DEFAULT_HISTORY_FILTERS,
    ...initial,
  });
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<HistoryState>(INITIAL_STATE);

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
      type: filters.type || undefined,
      productId: filters.productId || undefined,
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

    inventoryService
      .history(query, controller.signal)
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

  const update = useCallback((patch: Partial<HistoryFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_HISTORY_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" || filters.type !== "" || filters.productId !== "";

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
  };
}
