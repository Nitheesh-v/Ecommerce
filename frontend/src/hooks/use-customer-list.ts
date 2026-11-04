"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { customersService } from "@/services/admin/customers.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  Customer,
  CustomerDetail,
  CustomerOverview,
  CustomerSortField,
  CustomerStatus,
} from "@/types/customer";

export interface CustomerFilters {
  search: string;
  status: "" | CustomerStatus;
  /** `YYYY-MM-DD` from the date inputs. */
  from: string;
  to: string;
  /** Rupees in the UI; converted to paise when sent. */
  minSpent: string;
  maxSpent: string;
  hasOrders: boolean;
  page: number;
  limit: number;
  sortBy: CustomerSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = {
  search: "",
  status: "",
  from: "",
  to: "",
  minSpent: "",
  maxSpent: "",
  hasOrders: false,
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: Customer[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

function toMinorUnits(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
}

/** Server-paginated customer list (debounced search, abortable requests). */
export function useCustomerList(initial: Partial<CustomerFilters> = {}) {
  const [filters, setFilters] = useState<CustomerFilters>({
    ...DEFAULT_CUSTOMER_FILTERS,
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
      from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
      minSpent: toMinorUnits(filters.minSpent),
      maxSpent: toMinorUnits(filters.maxSpent),
      hasOrders: filters.hasOrders || undefined,
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

    customersService
      .list({ ...query, page: query.page, limit: query.limit }, controller.signal)
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

  const update = useCallback((patch: Partial<CustomerFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_CUSTOMER_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "" ||
    filters.from !== "" ||
    filters.to !== "" ||
    filters.minSpent !== "" ||
    filters.maxSpent !== "" ||
    filters.hasOrders;

  return {
    filters,
    query,
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

/** Org-wide analytics shown above the table. */
export function useCustomerAnalytics() {
  const [overview, setOverview] = useState<CustomerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    customersService
      .analytics(controller.signal)
      .then((result) => {
        if (active) {
          setOverview(result);
          setError(null);
        }
      })
      .catch((error_: unknown) => {
        if (active && !isAbortError(error_)) {
          setError(getApiErrorMessage(error_));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadToken]);

  return {
    overview,
    error,
    loading: overview === null && error === null,
    refresh: () => setReloadToken((token) => token + 1),
  };
}

/** One customer with metrics, addresses, activity and status history. */
export function useCustomerDetail(id: string) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    customersService
      .get(id, controller.signal)
      .then((result) => {
        if (active) {
          setCustomer(result);
          setError(null);
        }
      })
      .catch((error_: unknown) => {
        if (!active || isAbortError(error_)) {
          return;
        }

        setCustomer(null);
        setError(getApiErrorMessage(error_));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reloadToken]);

  return {
    customer,
    error,
    loading: customer === null && error === null,
    refresh: () => setReloadToken((token) => token + 1),
    setCustomer,
  };
}
