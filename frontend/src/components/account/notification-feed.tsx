"use client";

// src/components/account/notification-feed.tsx

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  CreditCard,
  Package,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { cn, formatDateTime } from "@/lib/utils";
import { notificationsService } from "@/services/store/notifications.service";
import type { NotificationFeedMeta } from "@/services/store/notifications.service";
import type { NotificationCategory, NotificationItem } from "@/types/notification";

const CATEGORY_ICONS: Record<NotificationCategory, typeof Bell> = {
  order: Package,
  payment: CreditCard,
  shipping: Truck,
  inventory: ShieldCheck,
  review: Star,
  account: Bell,
};

const CATEGORY_TONES: Record<NotificationCategory, string> = {
  order: "bg-sky-50 text-sky-700",
  payment: "bg-emerald-50 text-emerald-700",
  shipping: "bg-indigo-50 text-indigo-700",
  inventory: "bg-amber-50 text-amber-700",
  review: "bg-amber-50 text-amber-700",
  account: "bg-slate-100 text-slate-700",
};

type Tab = "all" | "unread";

interface FeedState {
  key: string;
  items: NotificationItem[];
  meta: NotificationFeedMeta | null;
  unread: number;
  error: string | null;
}

const PAGE_SIZE = 20;

/**
 * The customer's notification feed.
 *
 * Sorting, paging and the unread count are the API's: the browser never re-sorts or
 * re-counts, so `/account/notifications` and the header badge always agree. Opening
 * a notification marks it read (optimistically, reverting on failure) because that is
 * what the badge is for — a list where you must click "mark read" is a list nobody
 * clears.
 */
export function NotificationFeed() {
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [state, setState] = useState<FeedState>({
    key: "",
    items: [],
    meta: null,
    unread: 0,
    error: null,
  });

  const queryKey = `${tab}|${page}|${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    notificationsService
      .list(
        {
          page,
          limit: PAGE_SIZE,
          unreadOnly: tab === "unread" ? true : undefined,
        },
        controller.signal,
      )
      .then((result) => {
        if (!active) {
          return;
        }

        setState({
          key: queryKey,
          items: result.data,
          meta: result.meta,
          unread: result.meta.unread,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState((previous) => ({
          ...previous,
          key: queryKey,
          error: getApiErrorMessage(error),
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page, tab, queryKey]);

  const loading = state.key !== queryKey;

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const markOne = async (item: NotificationItem) => {
    if (item.read) {
      return;
    }

    setState((previous) => ({
      ...previous,
      items: previous.items.map((row) =>
        row.id === item.id ? { ...row, read: true } : row,
      ),
      unread: Math.max(0, previous.unread - 1),
    }));

    try {
      await notificationsService.markRead(item.id);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
      refresh();
    }
  };

  const markAll = async () => {
    setBusy(true);
    setActionError(null);

    try {
      await notificationsService.markAllRead();
      setState((previous) => ({
        ...previous,
        items: previous.items.map((row) => ({ ...row, read: true })),
        unread: 0,
      }));
      refresh();
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const meta = state.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter notifications"
          className="inline-flex rounded-lg border border-slate-200 bg-white p-1"
        >
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setTab(value);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {value === "all" ? "All" : `Unread${state.unread ? ` (${state.unread})` : ""}`}
            </button>
          ))}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={markAll}
          disabled={busy || state.unread === 0}
        >
          <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden />
          {busy ? "Marking…" : "Mark all read"}
        </Button>
      </div>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      {state.error ? <ErrorState message={state.error} onRetry={refresh} /> : null}

      {loading && state.items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : null}

      {!loading && !state.error && state.items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={tab === "unread" ? "Nothing unread" : "No notifications yet"}
          description={
            tab === "unread"
              ? "You have read everything. New order and delivery updates will appear here."
              : "Order, payment and delivery updates will appear here as they happen."
          }
          action={
            <Link
              href="/products"
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Browse products
            </Link>
          }
        />
      ) : null}

      <ul className="space-y-2">
        {state.items.map((item) => {
          const Icon = CATEGORY_ICONS[item.category] ?? Bell;
          const content = (
            <>
              <span
                className={cn(
                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  CATEGORY_TONES[item.category] ?? "bg-slate-100 text-slate-700",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {item.title}
                  </span>
                  {!item.read ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-600"
                    />
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">{item.body}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {formatDateTime(item.createdAt)}
                </span>
              </span>
            </>
          );

          return (
            <li key={item.id}>
              {item.link ? (
                <Link
                  href={item.link}
                  onClick={() => void markOne(item)}
                  data-testid="notification-row"
                  className={cn(
                    "flex gap-3 rounded-xl border bg-white p-4 transition-colors hover:border-slate-300",
                    item.read ? "border-slate-200" : "border-sky-200 bg-sky-50/40",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div
                  data-testid="notification-row"
                  className={cn(
                    "flex gap-3 rounded-xl border bg-white p-4",
                    item.read ? "border-slate-200" : "border-sky-200 bg-sky-50/40",
                  )}
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} notifications
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((value) => value + 1)}
              disabled={!meta.hasNextPage || loading}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
