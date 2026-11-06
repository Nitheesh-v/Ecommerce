// src/services/admin/notifications.service.ts

import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  AdminNotificationItem,
  AdminNotificationListQuery,
  NotificationAudience,
  NotificationOverview,
} from "@/types/notification";

function toParams(query: object) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/** Notification operations console (`/admin/notifications`). */
export const adminNotificationsService = {
  list(query: AdminNotificationListQuery, signal?: AbortSignal) {
    return requestPage<AdminNotificationItem>(
      apiClient.get<ApiSuccess<AdminNotificationItem[]>>("/admin/notifications", {
        signal,
        params: toParams(query),
      }),
    );
  },

  stats(audience: NotificationAudience = "admin", signal?: AbortSignal) {
    return requestData<NotificationOverview>(
      apiClient.get("/admin/notifications/stats", { signal, params: { audience } }),
    );
  },

  markRead(id: string) {
    return requestData<AdminNotificationItem>(
      apiClient.post(`/admin/notifications/${id}/read`),
    );
  },

  /** Re-attempts the email. The API refuses when SMTP is unconfigured. */
  retry(id: string) {
    return requestData<AdminNotificationItem>(
      apiClient.post(`/admin/notifications/${id}/retry`),
    );
  },
};
