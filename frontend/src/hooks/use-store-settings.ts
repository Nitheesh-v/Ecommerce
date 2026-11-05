"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { settingsService } from "@/services/admin/settings.service";
import type { StoreSettings, UpdateSettingsPayload } from "@/types/settings";

interface SettingsState {
  /** The reload token this state was loaded for; `-1` = nothing loaded yet. */
  token: number;
  settings: StoreSettings | null;
  error: string | null;
}

const INITIAL_STATE: SettingsState = { token: -1, settings: null, error: null };

/**
 * Loads the store's settings document and saves patches.
 *
 * The document is a single row, so there is no pagination or filtering here — only
 * "what is stored now" and "write this back". `loading` is derived from the settled
 * token, so a refresh never shows stale values as current.
 */
export function useStoreSettings() {
  const [state, setState] = useState<SettingsState>(INITIAL_STATE);
  const [token, setToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    settingsService
      .get(controller.signal)
      .then((settings) => {
        if (!controller.signal.aborted) {
          setState({ token, settings, error: null });
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted && !isAbortError(cause)) {
          setState({ token, settings: null, error: getApiErrorMessage(cause) });
        }
      });

    return () => controller.abort();
  }, [token]);

  const save = useCallback(
    async (payload: UpdateSettingsPayload) => {
      const updated = await settingsService.save(payload);

      setState((current) => ({ ...current, settings: updated, error: null }));

      return updated;
    },
    [],
  );

  const reload = useCallback(() => setToken((value) => value + 1), []);

  return {
    settings: state.settings,
    error: state.error,
    loading: state.token !== token,
    save,
    reload,
  };
}
