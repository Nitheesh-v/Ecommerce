// src/modules/notifications/repositories/notifications.repository.ts
import type {
  NotificationAudience,
  NotificationCategory,
  NotificationData,
  NotificationEmailStatus,
  NotificationType,
} from '../schemas/notification.schema.js';

/** A stored notification with driver types flattened. */
export interface NotificationRecord {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  audience: NotificationAudience;
  userId: string | null;
  recipientEmail: string;
  recipientName: string | null;
  title: string;
  body: string;
  link: string | null;
  data: NotificationData;
  emailSubject: string;
  emailText: string;
  emailHtml: string;
  emailStatus: NotificationEmailStatus;
  emailError: string | null;
  emailSentAt: Date | null;
  readAt: Date | null;
  attempts: number;
  lastAttemptAt: Date | null;
  dedupeKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationInput {
  type: NotificationType;
  category: NotificationCategory;
  audience: NotificationAudience;
  userId: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  title: string;
  body: string;
  link?: string | null;
  data?: NotificationData;
  emailSubject: string;
  emailText: string;
  emailHtml: string;
  emailStatus?: NotificationEmailStatus;
  /** Why the email was skipped/failed at insert time (e.g. no SMTP configured). */
  emailError?: string | null;
  dedupeKey?: string | null;
}

/** Fields a delivery attempt may change. */
export interface NotificationPatch {
  emailStatus?: NotificationEmailStatus;
  emailError?: string | null;
  emailSentAt?: Date | null;
  readAt?: Date | null;
  attempts?: number;
  lastAttemptAt?: Date | null;
}

export interface NotificationListFilter {
  page: number;
  limit: number;
  audience: NotificationAudience;
  /** Customer feed scope. `null` means "shop-wide rows" for the admin feed. */
  userId?: string | null;
  unreadOnly?: boolean;
  type?: NotificationType;
  category?: NotificationCategory;
  emailStatus?: NotificationEmailStatus;
  /** Matches title, body or recipient email. */
  search?: string;
  /** Inclusive created-at window. */
  from?: Date;
  to?: Date;
  sortOrder?: 'asc' | 'desc';
}

export interface NotificationStats {
  total: number;
  unread: number;
  emailDelivered: number;
  emailSkipped: number;
  emailFailed: number;
  /** Rows created in the last 24 hours. */
  last24h: number;
}

/**
 * Notification persistence.
 *
 * An abstract class is the DI token (the pattern used across this codebase), so
 * the e2e suite can swap in an in-memory implementation without a database.
 */
export abstract class NotificationsRepository {
  /**
   * Inserts a notification.
   *
   * @returns `null` when `dedupeKey` was already stored — the event has already
   * been announced, so the caller must not send it again.
   */
  abstract create(input: CreateNotificationInput): Promise<NotificationRecord | null>;

  abstract findById(id: string): Promise<NotificationRecord | null>;

  abstract list(
    filter: NotificationListFilter,
  ): Promise<{ items: NotificationRecord[]; total: number }>;

  abstract countUnread(userId: string): Promise<number>;

  abstract markRead(id: string, userId: string): Promise<NotificationRecord | null>;

  abstract markAllRead(userId: string): Promise<number>;

  abstract markReadAsAdmin(id: string): Promise<NotificationRecord | null>;

  abstract update(id: string, patch: NotificationPatch): Promise<NotificationRecord | null>;

  abstract stats(
    audience: NotificationAudience,
    userId?: string | null,
  ): Promise<NotificationStats>;
}
