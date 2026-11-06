// src/app/(store)/account/notifications/page.tsx

import type { Metadata } from "next";
import { NotificationFeed } from "@/components/account/notification-feed";
import { RequireCustomer } from "@/components/store/account/require-customer";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Order, payment and delivery updates for your account.",
  robots: { index: false, follow: false },
};

/** Signed-in only; the feed itself is fetched in the browser with the session token. */
export default function NotificationsPage() {
  return (
    <RequireCustomer>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Updates about your orders, payments and deliveries.
          </p>
        </div>
        <NotificationFeed />
      </div>
    </RequireCustomer>
  );
}
