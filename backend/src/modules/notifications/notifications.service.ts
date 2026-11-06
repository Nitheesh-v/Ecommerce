// src/modules/notifications/notifications.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnv } from '../../config/env.validation.js';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult, PaginationMeta } from '../../common/utils/pagination.util.js';
import { SettingsService } from '../settings/settings.service.js';
import { MailSender } from './mail/mail-sender.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';
import type {
  NotificationRecord,
  NotificationStats,
} from './repositories/notifications.repository.js';
import { renderNotification } from './templates/notification-templates.js';
import type {
  NotificationCategory,
  NotificationData,
  NotificationEmailStatus,
  NotificationType,
} from './schemas/notification.schema.js';
import type {
  AdminNotificationQueryDto,
  CustomerNotificationQueryDto,
} from './dto/notification.dto.js';

export interface NotifyInput {
  type: NotificationType;
  audience: 'customer' | 'admin';
  /** The customer this belongs to; omit for shop-wide rows. */
  userId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  data: NotificationData;
  /** Set `false` for in-app-only messages (most operator alerts). */
  email?: boolean;
  /** Event identity, e.g. `order_placed:<orderId>`. Duplicates become no-ops. */
  dedupeKey?: string | null;
}

export type NotifyOutcome = 'delivered' | 'failed' | 'skipped' | 'duplicate' | 'error';

export interface NotifyResult {
  outcome: NotifyOutcome;
  notification: NotificationRecord | null;
}

/** A notification as the storefront renders it. Deliberately narrow. */
export interface NotificationView {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  data: NotificationData;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/** The admin projection: adds delivery state and the recipient. */
export interface AdminNotificationView extends NotificationView {
  audience: 'customer' | 'admin';
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

/**
 * Pagination metadata plus the unread badge count.
 *
 * The count lives in `meta` rather than beside `data` because the response envelope
 * only promotes `{ data, meta }` — a list endpoint that returns `{ items, unread }`
 * would be wrapped as a single object and the count would be buried in it.
 */
export interface NotificationFeedMeta extends PaginationMeta {
  unread: number;
}

export interface NotificationOverviewView {
  stats: NotificationStats;
  email: { configured: boolean; transport: string };
  /** The types the store emits, so the console filters never go stale. */
  categories: NotificationCategory[];
}

/** Stats + transport, for the console's cards (served by `GET …/stats`). */
export interface AdminNotificationFeedView {
  stats: NotificationStats;
  email: { configured: boolean; transport: string };
}

/**
 * Notifications: record first, deliver second, never fail the caller.
 *
 * Three rules, and every line of this file follows from them:
 *
 * 1. **Persist before sending.** The row is the source of truth; the email is an
 *    attempt. A store with no SMTP, a provider outage or a bounced address loses
 *    the email, never the notification.
 * 2. **A notification is never allowed to break the operation that caused it.**
 *    `notify()` catches everything. An order must not fail because an inbox did.
 * 3. **One event, one message.** `dedupeKey` is unique in the database, so a
 *    replayed webhook or a re-emitted status cannot send the same mail twice.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly mailer: MailSender,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<ValidatedEnv, true>,
  ) {}

  /** Whether email would actually leave the process, for the console. */
  describeEmail(): { configured: boolean; transport: string } {
    return { configured: this.mailer.configured, transport: this.mailer.transport };
  }

  // ------------------------------------------------------------------ writes

  /**
   * Records a notification and attempts its email.
   *
   * @returns the outcome and the stored row. Never throws: a notification is a
   * side effect of a business action, so its failure must not undo that action.
   */
  async notify(input: NotifyInput): Promise<NotifyResult> {
    const wantsEmail = input.email ?? input.audience === 'customer';

    try {
      const store = await this.safeStore();
      const rendered = renderNotification({
        type: input.type,
        audience: input.audience,
        data: input.data,
        storeName: store.name,
        storeUrl: store.url,
        supportEmail: store.supportEmail,
        recipientName: input.recipientName ?? null,
      });

      const emailBlocked = !wantsEmail
        ? { emailStatus: 'skipped' as const, emailError: 'In-app only — email is not sent for this type' }
        : !this.mailer.configured
          ? {
              emailStatus: 'skipped' as const,
              emailError: 'SMTP is not configured — the notification is kept in the app',
            }
          : { emailStatus: 'pending' as const, emailError: null };

      const record = await this.notifications.create({
        type: input.type,
        category: rendered.category,
        audience: input.audience,
        userId: input.audience === 'admin' ? null : (input.userId ?? null),
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName ?? null,
        title: rendered.title,
        body: rendered.body,
        link: rendered.link,
        data: input.data,
        emailSubject: rendered.emailSubject,
        emailText: rendered.emailText,
        emailHtml: rendered.emailHtml,
        emailStatus: emailBlocked.emailStatus,
        emailError: emailBlocked.emailError,
        dedupeKey: input.dedupeKey ?? null,
      });

      if (!record) {
        // Same event, same recipient: already announced.
        return { outcome: 'duplicate', notification: null };
      }

      if (emailBlocked.emailStatus !== 'pending') {
        return { outcome: 'skipped', notification: record };
      }

      return await this.deliver(record);
    } catch (error) {
      this.logger.error(
        `Notification ${input.type} could not be recorded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return { outcome: 'error', notification: null };
    }
  }

  /**
   * Sends an operator alert to the store's support address.
   *
   * Admin rows have no `userId`: they belong to the shop, and any admin can read
   * them in the console. Email is opt-in per call — an alert for every order would
   * train the team to ignore the inbox.
   */
  async notifyAdmins(
    input: Omit<NotifyInput, 'audience' | 'userId' | 'recipientEmail'>,
  ): Promise<NotifyResult> {
    const store = await this.safeStore();

    return this.notify({
      ...input,
      audience: 'admin',
      userId: null,
      recipientEmail: store.supportEmail,
      email: input.email ?? false,
    });
  }

  /** Attempts delivery of a stored notification, recording the outcome. */
  private async deliver(record: NotificationRecord): Promise<NotifyResult> {
    const attempt = record.attempts + 1;

    try {
      await this.mailer.send({
        to: record.recipientEmail,
        subject: record.emailSubject,
        text: record.emailText,
        html: record.emailHtml,
      });

      const updated = await this.notifications.update(record.id, {
        emailStatus: 'delivered',
        emailError: null,
        emailSentAt: new Date(),
        attempts: attempt,
        lastAttemptAt: new Date(),
      });

      return { outcome: 'delivered', notification: updated ?? record };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Email for ${record.type} failed: ${reason}`);

      const updated = await this.notifications.update(record.id, {
        emailStatus: 'failed',
        emailError: reason.slice(0, 300),
        attempts: attempt,
        lastAttemptAt: new Date(),
      });

      return { outcome: 'failed', notification: updated ?? record };
    }
  }

  // ------------------------------------------------------------- customer feed

  async listMine(
    userId: string,
    query: CustomerNotificationQueryDto,
  ): Promise<PaginatedResult<NotificationView> & { meta: NotificationFeedMeta }> {
    const result = await this.notifications.list({
      page: query.page,
      limit: query.limit,
      audience: 'customer',
      userId,
      unreadOnly: query.unreadOnly,
      type: query.type,
      category: query.category,
      search: query.search,
    });

    const unread = await this.notifications.countUnread(userId);
    const page = createPaginatedResult(
      result.items.map((item) => this.toCustomerView(item)),
      query.page,
      query.limit,
      result.total,
    );

    return { data: page.data, meta: { ...page.meta, unread } };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    return { unread: await this.notifications.countUnread(userId) };
  }

  /** Marks one of the caller's own notifications read; someone else's is a 404. */
  async markRead(userId: string, id: string): Promise<NotificationView> {
    const updated = await this.notifications.markRead(id, userId);

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }

    return this.toCustomerView(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(userId) };
  }

  // ---------------------------------------------------------------- admin feed

  async listForAdmin(
    query: AdminNotificationQueryDto,
  ): Promise<PaginatedResult<AdminNotificationView>> {
    const { from, to } = this.parseRange(query.from, query.to);
    // The console reads the shop's own rows by default; a customer's feed is only
    // listed when an operator asks for it by audience.
    const result = await this.notifications.list({
      page: query.page,
      limit: query.limit,
      audience: query.audience,
      // `undefined`: an operator reviewing customer mail sees every customer's rows.
      userId: undefined,
      unreadOnly: query.unreadOnly,
      type: query.type,
      category: query.category,
      emailStatus: query.emailStatus,
      search: query.search,
      from,
      to,
    });

    return createPaginatedResult(
      result.items.map((item) => this.toAdminView(item)),
      query.page,
      query.limit,
      result.total,
    );
  }

  async statsForAdmin(
    audience: 'admin' | 'customer' = 'admin',
  ): Promise<NotificationOverviewView> {
    return {
      stats: await this.notifications.stats(audience),
      email: this.describeEmail(),
      categories: ['order', 'payment', 'shipping', 'inventory', 'review', 'account'],
    };
  }

  async markReadAsAdmin(id: string): Promise<AdminNotificationView> {
    const updated = await this.notifications.markReadAsAdmin(id);

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }

    return this.toAdminView(updated);
  }

  /**
   * Re-attempts the email of a failed (or skipped) notification.
   *
   * Refuses — rather than silently succeeding — when SMTP is still unconfigured or
   * the message was already delivered, so the console's button never lies.
   */
  async retry(id: string): Promise<AdminNotificationView> {
    const record = await this.notifications.findById(id);

    if (!record) {
      throw new NotFoundException('Notification not found');
    }
    if (record.emailStatus === 'delivered') {
      throw new ConflictException('This notification was already emailed');
    }
    if (!this.mailer.configured) {
      throw new BadRequestException(
        'Email is not configured on this server (set SMTP_HOST, SMTP_MAIL_FROM and the SMTP credentials)',
      );
    }

    const result = await this.deliver(record);

    return this.toAdminView(result.notification ?? record);
  }

  // ------------------------------------------------------------------ helpers

  private async safeStore(): Promise<{ name: string; url: string; supportEmail: string }> {
    const url = (this.config.get('FRONTEND_URL', { infer: true }) ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );

    try {
      const settings = await this.settings.get();

      return {
        name: settings.storeName,
        url,
        supportEmail: settings.supportEmail,
      };
    } catch (error) {
      // A notification must still be built when settings are unreadable.
      this.logger.warn(`Falling back to default store identity: ${String(error)}`);

      return { name: 'Our store', url, supportEmail: 'support@example.com' };
    }
  }

  private parseRange(from?: string, to?: string): { from?: Date; to?: Date } {
    const parsed: { from?: Date; to?: Date } = {};

    if (from) {
      const value = new Date(from);

      if (!Number.isNaN(value.getTime())) {
        parsed.from = value;
      }
    }
    if (to) {
      const value = new Date(to);

      if (!Number.isNaN(value.getTime())) {
        // An end date without a time means the whole day.
        value.setHours(23, 59, 59, 999);
        parsed.to = value;
      }
    }

    return parsed;
  }

  private toCustomerView(record: NotificationRecord): NotificationView {
    return {
      id: record.id,
      type: record.type,
      category: record.category,
      title: record.title,
      body: record.body,
      link: record.link,
      data: record.data,
      read: record.readAt !== null,
      readAt: record.readAt ? record.readAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private toAdminView(record: NotificationRecord): AdminNotificationView {
    return {
      ...this.toCustomerView(record),
      audience: record.audience,
      recipientEmail: record.recipientEmail,
      recipientName: record.recipientName,
      emailSubject: record.emailSubject,
      emailText: record.emailText,
      emailStatus: record.emailStatus,
      emailError: record.emailError,
      emailSentAt: record.emailSentAt ? record.emailSentAt.toISOString() : null,
      attempts: record.attempts,
      lastAttemptAt: record.lastAttemptAt ? record.lastAttemptAt.toISOString() : null,
    };
  }
}
