"use client";

// src/components/admin/notifications/notifications-view.tsx

import {
  Bell,
  Inbox,
  MailX,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { useNotificationList } from "@/hooks/use-notification-list";
import type { AdminNotificationItem } from "@/types/notification";
import { NotificationDetail } from "./notification-detail";
import { NotificationFiltersBar } from "./notification-filters";
import { NotificationTable } from "./notification-table";

/**
 * The notification console.
 *
 * Two jobs, one page: the shop's own alert feed (low stock, new reviews, new orders)
 * and — on the "Customer mail" audience — what each shopper was actually sent, which
 * is the first question support asks. The email transport is shown up front, because
 * "we sent them an email" is only true when SMTP is configured.
 */
export function NotificationsView() {
  const {
    filters,
    update,
    reset,
    refresh,
    items,
    meta,
    error,
    loading,
    hasActiveFilters,
    overview,
    overviewError,
  } = useNotificationList();

  const [selected, setSelected] = useState<AdminNotificationItem | null>(null);

  const onChanged = (updated: AdminNotificationItem) => {
    setSelected(updated);
    refresh();
  };

  const stats = overview?.stats;
  const email = overview?.email;

  const cards = [
    { key: "total", label: "Notifications", icon: Inbox, value: stats?.total, tone: "text-slate-700" },
    { key: "unread", label: "Unread", icon: Bell, value: stats?.unread, tone: "text-sky-600" },
    { key: "emailDelivered", label: "Emails sent", icon: Send, value: stats?.emailDelivered, tone: "text-emerald-600" },
    { key: "emailFailed", label: "Emails failed", icon: MailX, value: stats?.emailFailed, tone: "text-rose-600" },
    { key: "last24h", label: "Last 24 hours", icon: ShieldAlert, value: stats?.last24h, tone: "text-amber-600" },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Every message this store records — and what actually left by email."
        actions={
          email ? (
            <span
              className={
                email.configured
                  ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                  : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
              }
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              {email.configured ? `Email via ${email.transport}` : "Email not configured"}
            </span>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {overviewError ? (
          <Card className="p-4 sm:col-span-2 xl:col-span-5">
            <p className="text-sm text-rose-600">{overviewError}</p>
          </Card>
        ) : (
          cards.map((card) => (
            <Card key={card.key} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <card.icon className={`h-4 w-4 ${card.tone}`} aria-hidden />
              </div>
              {card.value === undefined ? (
                <Skeleton className="mt-2 h-7 w-12" />
              ) : (
                <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
              )}
            </Card>
          ))
        )}
      </div>

      {email && !email.configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">Email is not configured</p>
          <p className="mt-0.5 text-xs text-amber-800">
            Every notification is still recorded here, and its email half is marked
            skipped. Set <code className="font-mono">SMTP_HOST</code>,{" "}
            <code className="font-mono">SMTP_PORT</code> and{" "}
            <code className="font-mono">MAIL_FROM</code> on the server to start sending.
          </p>
        </div>
      ) : null}

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <NotificationFiltersBar
          filters={filters}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {loading && items.length === 0 ? (
          <div className="space-y-1 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-1 py-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Bell}
              title={hasActiveFilters ? "No matching notifications" : "Nothing yet"}
              description={
                hasActiveFilters
                  ? "Try a different audience, type or date range."
                  : "Order, payment, shipping and stock alerts will appear here as they happen."
              }
            />
          </div>
        ) : (
          <>
            <div className={loading ? "opacity-60 transition-opacity" : undefined}>
              <NotificationTable items={items} onOpen={setSelected} />
            </div>
            {meta ? (
              <Pagination meta={meta} onPageChange={(page) => update({ page })} />
            ) : null}
          </>
        )}
      </Card>

      <NotificationDetail
        item={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onChanged={onChanged}
      />
    </div>
  );
}
