"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { paymentsService } from "@/services/admin/payments.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  Payment,
  PaymentDetail,
  PaymentMethod,
  PaymentSortField,
  PaymentStatus,
  PaymentSummary,
} from "@/types/payment";

export interface PaymentFilters {
  search: string;
  status: "" | PaymentStatus;
  method: "" | PaymentMethod;
  /** `YYYY-MM-DD` from the date inputs. */
  from: string;
  to: string;
  page: number;
  limit: number;
  sortBy: PaymentSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_PAYMENT_FILTERS: PaymentFilters = {
  search: "",
  status: "",
  method: "",
  from: "",
  to: "",
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: Payment[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Server-paginated transaction list.
 *
 * Same shape as `useCustomerList`: a request key doubles as the loading flag, so no
 * state is set synchronously inside the effect (which React's lint rules forbid)
 * and an in-flight response can never overwrite a newer filter selection.
 */
export function usePaymentList(initial: Partial<PaymentFilters> = {}) {
  const [filters, setFilters] = useState<PaymentFilters>({
    ...DEFAULT_PAYMENT_FILTERS,
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
      method: filters.method || undefined,
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

    paymentsService
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

  const update = useCallback((patch: Partial<PaymentFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_PAYMENT_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "" ||
    filters.method !== "" ||
    filters.from !== "" ||
    filters.to !== "";

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

/** Totals behind the summary cards. */
export function usePaymentSummary() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    paymentsService
      .summary(controller.signal)
      .then((result) => {
        if (active) {
          setSummary(result);
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
    summary,
    error,
    loading: summary === null && error === null,
    refresh: () => setReloadToken((token) => token + 1),
  };
}

/** One transaction with its order, refunds and event timeline. */
export function usePaymentDetail(id: string) {
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    paymentsService
      .get(id, controller.signal)
      .then((result) => {
        if (active) {
          setPayment(result);
          setError(null);
        }
      })
      .catch((error_: unknown) => {
        if (!active || isAbortError(error_)) {
          return;
        }

        setPayment(null);
        setError(getApiErrorMessage(error_));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reloadToken]);

  return {
    payment,
    error,
    loading: payment === null && error === null,
    refresh: () => setReloadToken((token) => token + 1),
    setPayment,
  };
}
