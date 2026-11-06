"use client";

// src/components/admin/notifications/admin-notification-bell.tsx

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Popover } from "@/components/admin/layout/popover";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import { adminNotificationsService } from "@/services/admin/notifications.service";
import type { AdminNotificationItem } from "@/types/notification";

interface FeedState {
  key: string;
  items: AdminNotificationItem[];
  unread: number;
  error: string | null;
}

const PREVIEW_LIMIT = 5;

/**
 * The header bell.
 *
 * It loads when the popover opens (not on a timer): an alert about low stock is not
 * urgent to the second, and a polling loop in the chrome is a request per admin per
 * interval for a number nobody is watching. The badge itself is the unread count from
 * the same request pair, so it cannot disagree with the list below it.
 */
export function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FeedState>({
    key: "",
    items: [],
    unread: 0,
    error: null,
  });

  const queryKey = `${open}|${PREVIEW_LIMIT}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    Promise.all([
      adminNotificationsService.list(
        { audience: "admin", page: 1, limit: PREVIEW_LIMIT },
        controller.signal,
      ),
      adminNotificationsService.stats("admin", controller.signal),
    ])
      .then(([list, overview]) => {
        if (!active) {
          return;
        }

        setState({
          key: queryKey,
          items: list.data,
          unread: overview.stats.unread,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState((previous) => ({ ...previous, key: queryKey, error: getApiErrorMessage(error) }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [open, queryKey]);

  const loading = open && state.key !== queryKey;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={
          state.unread > 0 ? `Notifications, ${state.unread} unread` : "Notifications"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {state.unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white">
            {state.unread > 9 ? "9+" : state.unread}
          </span>
        ) : null}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} className="w-80">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          {state.unread > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {state.unread} unread
            </span>
          ) : null}
        </div>

        {state.error ? (
          <p className="px-4 py-6 text-center text-xs text-rose-600">{state.error}</p>
        ) : loading ? (
          <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse space-y-1">
                <div className="h-3 w-2/3 rounded bg-slate-100" />
                <div className="h-2.5 w-1/3 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : state.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Nothing here yet. Order and stock alerts will appear as they happen.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {state.items.map((item) => (
              <li key={item.id}>
                <Link
                  href="/admin/notifications"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="flex items-start gap-2">
                    <span
                      className={
                        item.read
                          ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-200"
                          : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600"
                      }
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {item.title}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">
                        {item.body}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-slate-100 px-4 py-2">
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            View all notifications
          </Link>
        </div>
      </Popover>
    </div>
  );
}
