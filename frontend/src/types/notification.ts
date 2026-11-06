// src/types/notification.ts

/** Mirrors `NOTIFICATION_CATEGORIES` on the API. */
export type NotificationCategory =
  | "order"
  | "payment"
  | "shipping"
  | "inventory"
  | "review"
  | "account";

/** Mirrors `NOTIFICATION_TYPES` on the API. */
export type NotificationType =
  | "order_placed"
  | "order_confirmed"
  | "order_shipped"
  | "order_out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "payment_failed"
  | "refund_processed"
  | "delivery_failed"
  | "inventory_low"
  | "inventory_out"
  | "review_submitted"
  | "welcome";

export type NotificationEmailStatus = "pending" | "delivered" | "failed" | "skipped";

export type NotificationAudience = "customer" | "admin";

/** A notification as the storefront renders it. */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Relative app path, or `null` when the message has nowhere to go. */
  link: string | null;
  data: Record<string, string | number | null>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/** The console projection: adds the recipient and the delivery state. */
export interface AdminNotificationItem extends NotificationItem {
  audience: NotificationAudience;
  recipientEmail: string;
  recipientName: string | null;
  emailSubject: string;
  emailText: string;
  emailStatus: NotificationEmailStatus;
  emailError: string | null;
  emailSentAt: string | null;
  attempts: number;
  lastAttemptAt: string | null;
}

/** Counts behind the console cards. */
export interface NotificationStats {
  total: number;
  unread: number;
  emailDelivered: number;
  emailSkipped: number;
  emailFailed: number;
  last24h: number;
}

/** `GET /api/admin/notifications/stats`. */
export interface NotificationOverview {
  stats: NotificationStats;
  email: { configured: boolean; transport: string };
  categories: NotificationCategory[];
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: "" | NotificationType;
  category?: "" | NotificationCategory;
  unreadOnly?: boolean;
}

export interface AdminNotificationListQuery extends NotificationListQuery {
  audience?: NotificationAudience;
  emailStatus?: "" | NotificationEmailStatus;
  from?: string;
  to?: string;
}
