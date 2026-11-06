// src/services/store/notifications.service.ts

import { apiClient } from "@/lib/api/client";
import type { ApiSuccess, PaginationMeta } from "@/types/auth";
import type { NotificationItem, NotificationListQuery } from "@/types/notification";

/** The feed's `meta` carries the unread count alongside the usual pagination. */
export type NotificationFeedMeta = PaginationMeta & { unread: number };

function toParams(query: object) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/**
 * The customer's own notification feed.
 *
 * Read-only apart from the two "mark read" calls: notifications are produced by the
 * server from real events (an order placed, a payment failed, a parcel delivered), so
 * there is no create endpoint to call.
 */
export const notificationsService = {
  async list(
    query: NotificationListQuery,
    signal?: AbortSignal,
  ): Promise<{ data: NotificationItem[]; meta: NotificationFeedMeta }> {
    const response = await apiClient.get<
      ApiSuccess<NotificationItem[]> & { meta: NotificationFeedMeta }
    >("/notifications", { signal, params: toParams(query) });

    return {
      data: response.data.data ?? [],
      meta:
        response.data.meta ?? {
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          total: response.data.data?.length ?? 0,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          unread: 0,
        },
    };
  },

  async unreadCount(signal?: AbortSignal): Promise<number> {
    const response = await apiClient.get<ApiSuccess<{ unread: number }>>(
      "/notifications/unread-count",
      { signal },
    );

    return response.data.data?.unread ?? 0;
  },

  markRead(id: string) {
    return apiClient
      .post<ApiSuccess<NotificationItem>>(`/notifications/${id}/read`)
      .then((response) => response.data.data);
  },

  markAllRead() {
    return apiClient
      .post<ApiSuccess<{ updated: number }>>("/notifications/read-all")
      .then((response) => response.data.data);
  },
};
