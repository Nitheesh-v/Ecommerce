"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { productsService } from "@/services/admin/products.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  AdminProduct,
  ProductSortField,
  ProductStatus,
  StockStatus,
} from "@/types/product";

export interface ProductFilters {
  search: string;
  category: string;
  status: "" | ProductStatus;
  stockStatus: "" | StockStatus;
  page: number;
  limit: number;
  sortBy: ProductSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  search: "",
  category: "",
  status: "",
  stockStatus: "",
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: AdminProduct[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Server-paginated product list.
 *
 * - Typing is debounced, so a search does not fire a request per keystroke.
 * - Changing a filter resets to page 1 (otherwise the admin lands on an empty page).
 * - `loading` is derived from the settled query key, so the previous page stays
 *   visible while the next one loads.
 */
export function useProductList(initial: Partial<ProductFilters> = {}) {
  const [filters, setFilters] = useState<ProductFilters>({
    ...DEFAULT_PRODUCT_FILTERS,
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
      category: filters.category || undefined,
      status: filters.status || undefined,
      stockStatus: filters.stockStatus || undefined,
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

    productsService
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

  /** Merge a partial filter change; any non-pagination change returns to page 1. */
  const update = useCallback((patch: Partial<ProductFilters>) => {
    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: patch.page ?? 1,
    }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_PRODUCT_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.category !== "" ||
    filters.status !== "" ||
    filters.stockStatus !== "";

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
