"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import {
  adminDashboardService,
  type DashboardQuery,
} from "@/services/admin/dashboard.service";
import type { DashboardOverview } from "@/types/admin";

interface SettledState {
  /** The query key the payload (or error) belongs to. */
  key: string;
  data: DashboardOverview | null;
  error: string | null;
}

const INITIAL_STATE: SettledState = { key: "", data: null, error: null };

/**
 * Fetches the dashboard overview and re-fetches whenever the period changes.
 *
 * `loading` is derived by comparing the key of the last settled response with the
 * current query instead of being toggled inside the effect, so there is no
 * cascading render and stale data stays visible while a new period loads.
 *
 * Pass `null` to pause fetching (used while a custom range is half-filled) — the
 * last payload is kept on screen.
 */
export function useDashboardOverview(query: DashboardQuery | null) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<SettledState>(INITIAL_STATE);

  const range = query?.range ?? null;
  const from = query?.from;
  const to = query?.to;
  const queryKey = range
    ? [range, from ?? "", to ?? "", reloadToken].join("|")
    : null;

  useEffect(() => {
    if (!range || !queryKey) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    adminDashboardService
      .getOverview({ range, from, to }, controller.signal)
      .then((data) => {
        if (active) {
          setState({ key: queryKey, data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState((previous) => ({
          key: queryKey,
          data: previous.data,
          error: getApiErrorMessage(error),
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [range, from, to, queryKey]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const settled = queryKey !== null && state.key === queryKey;

  return {
    data: state.data,
    error: settled ? state.error : null,
    loading: queryKey !== null && !settled,
    refresh,
  };
}
