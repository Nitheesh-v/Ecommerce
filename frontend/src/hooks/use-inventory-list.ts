"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { inventoryService } from "@/services/admin/inventory.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  InventoryRow,
  InventorySummary,
  StockSortField,
  StockStatus,
} from "@/types/inventory";

export interface InventoryFilters {
  search: string;
  categoryId: string;
  /** `""` = every status. */
  status: "" | StockStatus;
  page: number;
  limit: number;
  sortBy: StockSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  search: "",
  categoryId: "",
  status: "",
  page: 1,
  limit: 20,
  // Ascending quantity surfaces the products that need attention first.
  sortBy: "quantity",
  sortOrder: "asc",
};

interface ListState {
  key: string;
  items: InventoryRow[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Server-paginated inventory list.
 *
 * Same contract as the other admin list hooks: debounced search, page reset on
 * filter change, abortable requests, and `loading` derived by comparing the
 * settled query key with the current one (so there is no `setState` in an effect
 * just to flip a spinner).
 */
export function useInventoryList(initial: Partial<InventoryFilters> = {}) {
  const [filters, setFilters] = useState<InventoryFilters>({
    ...DEFAULT_INVENTORY_FILTERS,
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
      categoryId: filters.categoryId || undefined,
      stockStatus: filters.status || undefined,
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

    inventoryService
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

  const update = useCallback((patch: Partial<InventoryFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_INVENTORY_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" || filters.categoryId !== "" || filters.status !== "";

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

interface SummaryState {
  data: InventorySummary | null;
  error: string | null;
}

/**
 * Summary cards + open alerts.
 *
 * Reloaded with `refresh()` after an adjustment so the numbers never drift from
 * the table below them.
 */
export function useInventorySummary() {
  const [state, setState] = useState<SummaryState>({ data: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    inventoryService
      .summary(controller.signal)
      .then((data) => {
        if (active) {
          setState({ data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState({ data: null, error: getApiErrorMessage(error) });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { summary: state.data, error: state.error, refresh };
}
