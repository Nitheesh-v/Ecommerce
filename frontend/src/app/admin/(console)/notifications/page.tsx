// src/app/admin/(console)/notifications/page.tsx

import type { Metadata } from "next";
import { NotificationsView } from "@/components/admin/notifications/notifications-view";

export const metadata: Metadata = {
  title: "Notifications",
};

/** Opts out of instant-navigation validation — see the `admin/(console)` convention. */
export const instant = false;

export default function AdminNotificationsPage() {
  return <NotificationsView />;
}
