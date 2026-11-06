"use client";

// src/hooks/use-notification-list.ts

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { adminNotificationsService } from "@/services/admin/notifications.service";
import type { PaginationMeta } from "@/types/auth";
import type {
  AdminNotificationItem,
  AdminNotificationListQuery,
  NotificationAudience,
  NotificationCategory,
  NotificationEmailStatus,
  NotificationOverview,
  NotificationType,
} from "@/types/notification";

export interface NotificationFilters {
  search: string;
  audience: NotificationAudience;
  type: "" | NotificationType;
  category: "" | NotificationCategory;
  emailStatus: "" | NotificationEmailStatus;
  unreadOnly: boolean;
  from: string;
  to: string;
  page: number;
  limit: number;
}

export const DEFAULT_NOTIFICATION_FILTERS: NotificationFilters = {
  search: "",
  audience: "admin",
  type: "",
  category: "",
  emailStatus: "",
  unreadOnly: false,
  from: "",
  to: "",
  page: 1,
  limit: 20,
};

interface ListState {
  key: string;
  items: AdminNotificationItem[];
  meta: PaginationMeta | null;
  error: string | null;
}

const INITIAL_STATE: ListState = { key: "", items: [], meta: null, error: null };
const SEARCH_DEBOUNCE_MS = 350;

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`).toISOString();
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`).toISOString();

/**
 * Server-paginated notification feed plus the console cards.
 *
 * Same shape as the reviews/offers lists: debounced search, page reset on any filter
 * change, abortable requests and `loading` derived from the settled query key, so the
 * table never presents the previous audience's rows as the current ones.
 */
export function useNotificationList(initial: Partial<NotificationFilters> = {}) {
  const [filters, setFilters] = useState<NotificationFilters>({
    ...DEFAULT_NOTIFICATION_FILTERS,
    ...initial,
  });
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>(INITIAL_STATE);
  const [overview, setOverview] = useState<NotificationOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      SEARCH_DEBOUNCE_MS,
    );

    return () => clearTimeout(timer);
  }, [filters.search]);

  const query = useMemo<AdminNotificationListQuery>(
    () => ({
      page: filters.page,
      limit: filters.limit,
      search: debouncedSearch || undefined,
      audience: filters.audience,
      type: filters.type || undefined,
      category: filters.category || undefined,
      emailStatus: filters.emailStatus || undefined,
      unreadOnly: filters.unreadOnly || undefined,
      from: filters.from ? startOfDay(filters.from) : undefined,
      to: filters.to ? endOfDay(filters.to) : undefined,
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

    adminNotificationsService
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

  // The cards describe the selected audience, not the current filter set.
  useEffect(() => {
    const controller = new AbortController();

    adminNotificationsService
      .stats(filters.audience, controller.signal)
      .then((result) => {
        setOverview(result);
        setOverviewError(null);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setOverviewError(getApiErrorMessage(error));
        }
      });

    return () => controller.abort();
  }, [filters.audience, reloadToken]);

  const update = useCallback((patch: Partial<NotificationFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_NOTIFICATION_FILTERS);
    setDebouncedSearch("");
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.type !== "" ||
    filters.category !== "" ||
    filters.emailStatus !== "" ||
    filters.unreadOnly ||
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
    overview,
    overviewError,
  };
}
