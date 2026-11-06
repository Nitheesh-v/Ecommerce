"use client";

// src/components/store/notification-bell.tsx

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { isAbortError } from "@/lib/api/errors";
import { notificationsService } from "@/services/store/notifications.service";
import { useCustomerAuthStore } from "@/store/customer-auth.store";

/**
 * The unread badge in the storefront header.
 *
 * Only rendered for a signed-in shopper (it links to `/account/notifications`).
 * The count is a *hint*, not a source of truth: it is re-read when the tab regains
 * focus, so a message that arrived while the page was open still appears without a
 * reload. A failed read leaves the bell plain rather than showing a stale number.
 */
export function NotificationBell() {
  const user = useCustomerAuthStore((state) => state.user);
  const status = useCustomerAuthStore((state) => state.status);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) {
      return;
    }

    const controller = new AbortController();

    const load = () => {
      notificationsService
        .unreadCount(controller.signal)
        .then(setUnread)
        .catch((error: unknown) => {
          if (!isAbortError(error)) {
            setUnread(0);
          }
        });
    };

    load();

    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [user, status]);

  if (!user) {
    return null;
  }

  return (
    <Link
      href="/account/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden />
      {unread > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
