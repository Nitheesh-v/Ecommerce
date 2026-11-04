"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { ordersService } from "@/services/admin/orders.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  Order,
  OrderSortField,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/types/order";

export interface OrderFilters {
  search: string;
  status: "" | OrderStatus;
  paymentStatus: "" | PaymentStatus;
  paymentMethod: "" | PaymentMethod;
  /** `YYYY-MM-DD` from the date inputs; converted to an ISO instant when sent. */
  from: string;
  to: string;
  page: number;
  limit: number;
  sortBy: OrderSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  search: "",
  status: "",
  paymentStatus: "",
  paymentMethod: "",
  from: "",
  to: "",
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: Order[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

/** Server-paginated order list with debounced search and abortable requests. */
export function useOrderList(initial: Partial<OrderFilters> = {}) {
  const [filters, setFilters] = useState<OrderFilters>({
    ...DEFAULT_ORDER_FILTERS,
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
      paymentStatus: filters.paymentStatus || undefined,
      paymentMethod: filters.paymentMethod || undefined,
      // A date input means a calendar day in the operator's timezone.
      from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
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

    ordersService
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

  const update = useCallback((patch: Partial<OrderFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_ORDER_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "" ||
    filters.paymentStatus !== "" ||
    filters.paymentMethod !== "" ||
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
  };
}

interface DetailState {
  order: Order | null;
  error: string | null;
}

/**
 * One order (admin detail).
 *
 * `refresh()` re-reads after every action; mutations are never applied optimistically
 * because the server decides whether a transition, restock or refund is allowed.
 */
export function useOrderDetail(id: string) {
  const [state, setState] = useState<DetailState>({ order: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    ordersService
      .get(id, controller.signal)
      .then((order) => {
        if (active) {
          setState({ order, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState({ order: null, error: getApiErrorMessage(error) });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { order: state.order, error: state.error, refresh, setOrder: (order: Order) => setState({ order, error: null }) };
}
