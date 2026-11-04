"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  AdminCategory,
  CategorySortField,
  CategoryStatus,
} from "@/types/category";

export interface CategoryFilters {
  search: string;
  status: "" | CategoryStatus;
  /** `""` = all levels, `"root"` = top level, otherwise a category id. */
  parentId: string;
  page: number;
  limit: number;
  sortBy: CategorySortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_CATEGORY_FILTERS: CategoryFilters = {
  search: "",
  status: "",
  parentId: "",
  page: 1,
  limit: 20,
  sortBy: "displayOrder",
  sortOrder: "asc",
};

interface ListState {
  key: string;
  items: AdminCategory[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Server-paginated category list — same shape as `useProductList`:
 * debounced search, page reset on filter change, abortable requests and a
 * loading flag derived from the settled query key.
 */
export function useCategoryList(initial: Partial<CategoryFilters> = {}) {
  const [filters, setFilters] = useState<CategoryFilters>({
    ...DEFAULT_CATEGORY_FILTERS,
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
      parentId: filters.parentId || undefined,
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

    categoriesService
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

  const update = useCallback((patch: Partial<CategoryFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_CATEGORY_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "" ||
    filters.parentId !== "";

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
