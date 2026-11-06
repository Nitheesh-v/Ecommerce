// test/support/in-memory-notifications.repository.ts

import { randomUUID } from 'node:crypto';
import { NotificationsRepository } from '../../src/modules/notifications/repositories/notifications.repository.js';
import type {
  CreateNotificationInput,
  NotificationListFilter,
  NotificationPatch,
  NotificationRecord,
  NotificationStats,
} from '../../src/modules/notifications/repositories/notifications.repository.js';
import type { NotificationAudience } from '../../src/modules/notifications/schemas/notification.schema.js';

const clone = (record: NotificationRecord): NotificationRecord => ({
  ...record,
  data: { ...record.data },
});

/**
 * In-memory notification store.
 *
 * It mirrors the two behaviours the real collection guarantees and the services rely
 * on: the unique `dedupeKey` (a repeat insert is `null`, not a duplicate) and
 * owner-scoped reads (another customer's row is simply not found).
 */
export class InMemoryNotificationsRepository implements NotificationsRepository {
  private records: NotificationRecord[] = [];

  async create(input: CreateNotificationInput): Promise<NotificationRecord | null> {
    if (input.dedupeKey && this.records.some((row) => row.dedupeKey === input.dedupeKey)) {
      return null;
    }

    const now = new Date();
    const record: NotificationRecord = {
      id: randomUUID(),
      type: input.type,
      category: input.category,
      audience: input.audience,
      userId: input.userId,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName ?? null,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      data: input.data ?? {},
      emailSubject: input.emailSubject,
      emailText: input.emailText,
      emailHtml: input.emailHtml,
      emailStatus: input.emailStatus ?? 'pending',
      emailError: input.emailError ?? null,
      emailSentAt: null,
      readAt: null,
      attempts: 0,
      lastAttemptAt: null,
      dedupeKey: input.dedupeKey ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.records.push(record);

    return clone(record);
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    const record = this.records.find((row) => row.id === id);

    return record ? clone(record) : null;
  }

  async list(
    filter: NotificationListFilter,
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    const matches = this.records.filter((row) => this.matches(row, filter));

    matches.sort((a, b) =>
      filter.sortOrder === 'asc'
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const start = (filter.page - 1) * filter.limit;

    return {
      items: matches.slice(start, start + filter.limit).map(clone),
      total: matches.length,
    };
  }

  async countUnread(userId: string): Promise<number> {
    return this.records.filter(
      (row) => row.audience === 'customer' && row.userId === userId && row.readAt === null,
    ).length;
  }

  async markRead(id: string, userId: string): Promise<NotificationRecord | null> {
    const record = this.records.find(
      (row) => row.id === id && row.audience === 'customer' && row.userId === userId,
    );

    if (!record) {
      return null;
    }

    record.readAt = record.readAt ?? new Date();
    record.updatedAt = new Date();

    return clone(record);
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = this.records.filter(
      (row) => row.audience === 'customer' && row.userId === userId && row.readAt === null,
    );

    for (const row of rows) {
      row.readAt = new Date();
      row.updatedAt = new Date();
    }

    return rows.length;
  }

  async markReadAsAdmin(id: string): Promise<NotificationRecord | null> {
    const record = this.records.find((row) => row.id === id && row.audience === 'admin');

    if (!record) {
      return null;
    }

    record.readAt = record.readAt ?? new Date();
    record.updatedAt = new Date();

    return clone(record);
  }

  async update(id: string, patch: NotificationPatch): Promise<NotificationRecord | null> {
    const record = this.records.find((row) => row.id === id);

    if (!record) {
      return null;
    }

    Object.assign(record, patch, { updatedAt: new Date() });

    return clone(record);
  }

  async stats(
    audience: NotificationAudience,
    userId?: string | null,
  ): Promise<NotificationStats> {
    const scope = this.records.filter(
      (row) =>
        row.audience === audience &&
        (audience === 'admin' ? true : row.userId === (userId ?? null)),
    );
    const since = Date.now() - 24 * 60 * 60 * 1000;

    return {
      total: scope.length,
      unread: scope.filter((row) => row.readAt === null).length,
      emailDelivered: scope.filter((row) => row.emailStatus === 'delivered').length,
      emailSkipped: scope.filter((row) => row.emailStatus === 'skipped').length,
      emailFailed: scope.filter((row) => row.emailStatus === 'failed').length,
      last24h: scope.filter((row) => row.createdAt.getTime() >= since).length,
    };
  }

  /* ------------------------------------------------------------- test helpers */

  /** Every stored row, oldest first — for assertions. */
  all(): NotificationRecord[] {
    return this.records.map(clone);
  }

  /** Fixture/assertion helper: rows for one customer. */
  forUser(userId: string): NotificationRecord[] {
    return this.records.filter((row) => row.userId === userId).map(clone);
  }

  /** Fixture helper: pretend an email attempt failed, to exercise the retry path. */
  markEmailFailed(id: string, reason = 'SMTP timeout'): void {
    const record = this.records.find((row) => row.id === id);

    if (record) {
      // Simulates the row a failing send would leave behind, without inventing an
      // extra attempt (the initial, successful attempt already counted as one).
      record.emailStatus = 'failed';
      record.emailError = reason;
      record.lastAttemptAt = new Date();
    }
  }

  reset(): void {
    this.records = [];
  }

  private matches(record: NotificationRecord, filter: NotificationListFilter): boolean {
    if (record.audience !== filter.audience) {
      return false;
    }
    // `undefined` = every customer (admin support view); explicit `null` = guest rows.
    if (
      filter.audience === 'customer' &&
      filter.userId !== undefined &&
      record.userId !== filter.userId
    ) {
      return false;
    }
    if (filter.unreadOnly && record.readAt !== null) {
      return false;
    }
    if (filter.type && record.type !== filter.type) {
      return false;
    }
    if (filter.category && record.category !== filter.category) {
      return false;
    }
    if (filter.emailStatus && record.emailStatus !== filter.emailStatus) {
      return false;
    }
    if (filter.from && record.createdAt < filter.from) {
      return false;
    }
    if (filter.to && record.createdAt > filter.to) {
      return false;
    }
    if (filter.search?.trim()) {
      const needle = filter.search.trim().toLowerCase();

      return [record.title, record.body, record.recipientEmail].some((value) =>
        value.toLowerCase().includes(needle),
      );
    }

    return true;
  }
}
