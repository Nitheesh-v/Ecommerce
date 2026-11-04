"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { shipmentsService } from "@/services/admin/shipments.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  CourierOptions,
  EligibleOrder,
  Shipment,
  ShipmentDetail,
  ShipmentSortField,
  ShipmentStatus,
  ShipmentSummary,
} from "@/types/shipment";

export interface ShipmentFilters {
  search: string;
  status: "" | ShipmentStatus;
  courier: string;
  /** `YYYY-MM-DD` from the date inputs. */
  from: string;
  to: string;
  delayedOnly: boolean;
  page: number;
  limit: number;
  sortBy: ShipmentSortField;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_SHIPMENT_FILTERS: ShipmentFilters = {
  search: "",
  status: "",
  courier: "",
  from: "",
  to: "",
  delayedOnly: false,
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ListState {
  key: string;
  items: Shipment[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Server-paginated shipment list.
 *
 * Same shape as `usePaymentList`: the request key doubles as the loading flag, so
 * nothing is set synchronously inside an effect and a slow response can never
 * overwrite a newer filter selection.
 */
export function useShipmentList(initial: Partial<ShipmentFilters> = {}) {
  const [filters, setFilters] = useState<ShipmentFilters>({
    ...DEFAULT_SHIPMENT_FILTERS,
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
      courier: filters.courier || undefined,
      from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
      delayed: filters.delayedOnly ? true : undefined,
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

    shipmentsService
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

  const update = useCallback((patch: Partial<ShipmentFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_SHIPMENT_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "" ||
    filters.courier !== "" ||
    filters.from !== "" ||
    filters.to !== "" ||
    filters.delayedOnly;

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

/** Counts behind the summary cards. */
export function useShipmentSummary() {
  const [summary, setSummary] = useState<ShipmentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    shipmentsService
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

/** Configured courier partners (whether or not credentials exist). */
export function useCourierOptions() {
  const [options, setOptions] = useState<CourierOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    shipmentsService
      .couriers(controller.signal)
      .then((result) => {
        if (active) {
          setOptions(result);
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
  }, []);

  return { options, error, loading: options === null && error === null };
}

/** One shipment with its order, address and event history. */
export function useShipmentDetail(id: string) {
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    shipmentsService
      .get(id, controller.signal)
      .then((result) => {
        if (active) {
          setShipment(result);
          setError(null);
        }
      })
      .catch((error_: unknown) => {
        if (!active || isAbortError(error_)) {
          return;
        }

        setShipment(null);
        setError(getApiErrorMessage(error_));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reloadToken]);

  return {
    shipment,
    error,
    loading: shipment === null && error === null,
    refresh: () => setReloadToken((token) => token + 1),
    setShipment,
  };
}

/** Orders that can be shipped right now (for the create dialog). */
export function useEligibleOrders(search: string) {
  const [orders, setOrders] = useState<EligibleOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debounced, setDebounced] = useState(search.trim());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    shipmentsService
      .eligible(controller.signal, debounced || undefined)
      .then((result) => {
        if (active) {
          setOrders(result);
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
  }, [debounced, reloadToken]);

  return {
    orders,
    error,
    refresh: () => setReloadToken((token) => token + 1),
  };
}
