// src/modules/notifications/notifications.service.spec.ts

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ValidatedEnv } from '../../config/env.validation.js';
import type { SettingsService } from '../settings/settings.service.js';
import { MailDeliveryError, MailSender, NoopMailSender } from './mail/mail-sender.js';
import type { MailMessage } from './mail/mail-sender.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';
import type {
  CreateNotificationInput,
  NotificationListFilter,
  NotificationPatch,
  NotificationRecord,
  NotificationStats,
} from './repositories/notifications.repository.js';
import type { AdminNotificationQueryDto } from './dto/notification.dto.js';
import { renderNotification, formatMoney } from './templates/notification-templates.js';

/** Recording transport: succeeds, and remembers what it was asked to send. */
class RecordingMailer extends MailSender {
  readonly configured = true;
  readonly transport = 'recording';
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** A transport that refuses everything, the way a dead relay would. */
class FailingMailer extends MailSender {
  readonly configured = true;
  readonly transport = 'failing';

  async send(): Promise<void> {
    throw new MailDeliveryError('Connection refused');
  }
}

const clone = (record: NotificationRecord): NotificationRecord => ({
  ...record,
  data: { ...record.data },
});

/** Minimal repository double with the same contract as the Mongoose one. */
class FakeNotificationsRepository implements NotificationsRepository {
  records: NotificationRecord[] = [];
  private counter = 0;

  async create(input: CreateNotificationInput): Promise<NotificationRecord | null> {
    if (input.dedupeKey && this.records.some((row) => row.dedupeKey === input.dedupeKey)) {
      return null;
    }

    this.counter += 1;
    const now = new Date('2026-01-01T10:00:00.000Z');
    const record: NotificationRecord = {
      id: `notification-${this.counter}`,
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
    const matches = this.records.filter(
      (row) =>
        row.audience === filter.audience &&
        (filter.audience === 'admin' ||
          filter.userId === undefined ||
          row.userId === filter.userId) &&
        (!filter.unreadOnly || row.readAt === null) &&
        (!filter.type || row.type === filter.type) &&
        (!filter.emailStatus || row.emailStatus === filter.emailStatus) &&
        (!filter.search?.trim() ||
          [row.title, row.body, row.recipientEmail].some((value) =>
            value.toLowerCase().includes(filter.search!.trim().toLowerCase()),
          )),
    );

    return { items: matches.map(clone), total: matches.length };
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

    record.readAt = new Date();
    record.updatedAt = new Date();

    return clone(record);
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = this.records.filter(
      (row) => row.audience === 'customer' && row.userId === userId && row.readAt === null,
    );

    for (const row of rows) {
      row.readAt = new Date();
    }

    return rows.length;
  }

  async markReadAsAdmin(id: string): Promise<NotificationRecord | null> {
    const record = this.records.find((row) => row.id === id && row.audience === 'admin');

    if (!record) {
      return null;
    }

    record.readAt = new Date();

    return clone(record);
  }

  async update(id: string, patch: NotificationPatch): Promise<NotificationRecord | null> {
    const record = this.records.find((row) => row.id === id);

    if (!record) {
      return null;
    }

    Object.assign(record, patch);

    return clone(record);
  }

  async stats(audience: 'customer' | 'admin', userId?: string | null): Promise<NotificationStats> {
    const scope = this.records.filter(
      (row) =>
        row.audience === audience &&
        (audience === 'admin' || row.userId === (userId ?? null)),
    );

    return {
      total: scope.length,
      unread: scope.filter((row) => row.readAt === null).length,
      emailDelivered: scope.filter((row) => row.emailStatus === 'delivered').length,
      emailSkipped: scope.filter((row) => row.emailStatus === 'skipped').length,
      emailFailed: scope.filter((row) => row.emailStatus === 'failed').length,
      last24h: scope.length,
    };
  }
}

const settings = {
  get: async () => ({
    storeName: 'Nit Store',
    supportEmail: 'support@nit.example',
    supportPhone: '+91 90000 00000',
  }),
} as unknown as SettingsService;

const config = {
  get: (key: string) => (key === 'FRONTEND_URL' ? 'https://shop.example' : undefined),
} as unknown as ConfigService<ValidatedEnv, true>;

function build(mailer: MailSender = new RecordingMailer()) {
  const repository = new FakeNotificationsRepository();
  const service = new NotificationsService(
    repository,
    mailer,
    settings,
    config,
  );

  return { repository, service, mailer };
}

const ORDER_DATA = {
  orderId: 'order-1',
  orderNumber: 'ORD-20260101-0001',
  total: 194_900,
  currency: 'INR',
  customerName: 'Asha Rao',
};

const adminQuery = (overrides: Partial<AdminNotificationQueryDto> = {}) =>
  ({
    page: 1,
    limit: 20,
    audience: 'admin',
    order: 'desc',
    ...overrides,
  }) as AdminNotificationQueryDto;

describe('NotificationsService', () => {
  it('records a notification and emails it when a transport is configured', async () => {
    const { repository, service, mailer } = build();

    const result = await service.notify({
      type: 'order_placed',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'asha@example.com',
      recipientName: 'Asha Rao',
      data: ORDER_DATA,
      dedupeKey: 'order_placed:order-1',
    });

    expect(result.outcome).toBe('delivered');
    expect(repository.records).toHaveLength(1);
    expect(repository.records[0].emailStatus).toBe('delivered');
    expect(repository.records[0].emailSentAt).toBeInstanceOf(Date);
    expect(repository.records[0].title).toBe('Order ORD-20260101-0001 received');
    expect((mailer as RecordingMailer).sent[0].to).toBe('asha@example.com');
    expect((mailer as RecordingMailer).sent[0].subject).toContain('ORD-20260101-0001');
  });

  it('keeps the notification in-app and marks the email skipped when SMTP is missing', async () => {
    const { repository, service } = build(new NoopMailSender());

    const result = await service.notify({
      type: 'order_confirmed',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
    });

    expect(result.outcome).toBe('skipped');
    expect(repository.records[0].emailStatus).toBe('skipped');
    expect(repository.records[0].emailError).toContain('SMTP is not configured');
    // The row — the part that matters — is always written.
    expect(repository.records[0].body).toContain('confirmed');
  });

  it('records a failed send instead of throwing, and exposes the reason', async () => {
    const { repository, service } = build(new FailingMailer());

    const result = await service.notify({
      type: 'order_placed',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
    });

    expect(result.outcome).toBe('failed');
    expect(repository.records[0].emailStatus).toBe('failed');
    expect(repository.records[0].emailError).toBe('Connection refused');
    expect(repository.records[0].attempts).toBe(1);
  });

  it('deduplicates by event key: the second delivery is a no-op', async () => {
    const { repository, service, mailer } = build();

    await service.notify({
      type: 'order_placed',
      audience: 'customer',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
      dedupeKey: 'order_placed:order-1',
    });
    const second = await service.notify({
      type: 'order_placed',
      audience: 'customer',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
      dedupeKey: 'order_placed:order-1',
    });

    expect(second.outcome).toBe('duplicate');
    expect(repository.records).toHaveLength(1);
    expect((mailer as RecordingMailer).sent).toHaveLength(1);
  });

  it('sends operator alerts in-app only, unless asked to email them', async () => {
    const { repository, service } = build();

    await service.notifyAdmins({
      type: 'review_submitted',
      data: { productName: 'Kettle', rating: 5 },
    });
    await service.notifyAdmins({
      type: 'inventory_out',
      data: { productName: 'Kettle', sku: 'KET-1', quantity: 0 },
      email: true,
    });

    expect(repository.records).toHaveLength(2);
    // The support address is the recipient: an operator alert is not a customer's mail.
    expect(repository.records[0].recipientEmail).toBe('support@nit.example');
    expect(repository.records[0].audience).toBe('admin');
    expect(repository.records[0].userId).toBeNull();
    expect(repository.records[0].emailStatus).toBe('skipped');
    expect(repository.records[1].emailStatus).toBe('delivered');
  });

  it('lists a customer feed with the unread count, newest first', async () => {
    const { service } = build(new NoopMailSender());

    for (const [index, type] of (['order_placed', 'order_confirmed'] as const).entries()) {
      await service.notify({
        type,
        audience: 'customer',
        userId: 'user-1',
        recipientEmail: 'asha@example.com',
        data: ORDER_DATA,
        dedupeKey: `${type}:${index}`,
      });
    }

    const feed = await service.listMine('user-1', { page: 1, limit: 20, order: 'desc' });

    expect(feed.data).toHaveLength(2);
    expect(feed.meta.unread).toBe(2);
    expect(feed.meta.total).toBe(2);
    expect(feed.data[0].read).toBe(false);
  });

  it('never returns another customer’s notification', async () => {
    const { service } = build(new NoopMailSender());

    const created = await service.notify({
      type: 'order_placed',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
    });

    await expect(
      service.markRead('user-2', created.notification?.id ?? 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const feed = await service.listMine('user-2', { page: 1, limit: 20, order: 'desc' });

    expect(feed.data).toHaveLength(0);
    expect(feed.meta.unread).toBe(0);
  });

  it('marks one read, then all of them', async () => {
    const { service } = build(new NoopMailSender());

    const first = await service.notify({
      type: 'order_placed',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
    });
    await service.notify({
      type: 'order_delivered',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
    });

    const read = await service.markRead('user-1', first.notification?.id ?? '');

    expect(read.read).toBe(true);
    expect(await service.unreadCount('user-1')).toEqual({ unread: 1 });
    expect(await service.markAllRead('user-1')).toEqual({ updated: 1 });
    expect(await service.unreadCount('user-1')).toEqual({ unread: 0 });
  });

  it('filters the admin feed by audience, email state and search', async () => {
    const { service } = build();

    await service.notifyAdmins({
      type: 'inventory_low',
      data: { productName: 'Copper Kettle', sku: 'KET-1', quantity: 1 },
      email: true,
    });
    await service.notify({
      type: 'order_delivered',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'ravi@example.com',
      data: { ...ORDER_DATA, orderNumber: 'ORD-9' },
    });

    const shopFeed = await service.listForAdmin(adminQuery());
    const customerFeed = await service.listForAdmin(adminQuery({ audience: 'customer' }));
    const delivered = await service.listForAdmin(adminQuery({ emailStatus: 'delivered' }));
    const searched = await service.listForAdmin(
      adminQuery({ audience: 'customer', search: 'ravi' }),
    );

    // `notify()` records an admin row only when asked: the customer row above is not
    // part of the shop feed.
    expect(shopFeed.data).toHaveLength(1);
    expect(shopFeed.data[0].type).toBe('inventory_low');
    expect((await service.statsForAdmin('admin')).stats.total).toBe(1);
    expect(customerFeed.data).toHaveLength(1);
    expect(customerFeed.data[0].recipientEmail).toBe('ravi@example.com');
    expect(delivered.data.every((item) => item.emailStatus === 'delivered')).toBe(true);
    expect(searched.data[0].recipientEmail).toBe('ravi@example.com');
  });

  it('refuses to retry when email is unconfigured, and refuses an already-delivered one', async () => {
    const skipped = build(new NoopMailSender());

    const record = await skipped.service.notify({
      type: 'order_placed',
      audience: 'customer',
      userId: 'user-1',
      recipientEmail: 'asha@example.com',
      data: ORDER_DATA,
    });

    await expect(skipped.service.retry(record.notification?.id ?? '')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const delivered = build();

    const sent = await delivered.service.notifyAdmins({
      type: 'inventory_low',
      data: { productName: 'Kettle' },
      email: true,
    });

    await expect(delivered.service.retry(sent.notification?.id ?? '')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('retries a failed email and records the success', async () => {
    const { repository, service } = build();

    const created = await service.notifyAdmins({
      type: 'inventory_low',
      data: { productName: 'Kettle', sku: 'KET-1', quantity: 2 },
      email: true,
    });
    const id = created.notification?.id ?? '';

    repository.records[0].emailStatus = 'failed';
    repository.records[0].emailError = 'Mailbox unavailable';

    const retried = await service.retry(id);

    expect(retried.emailStatus).toBe('delivered');
    expect(retried.attempts).toBe(2);
    expect(retried.emailError).toBeNull();
  });

  it('404s a retry for an unknown notification', async () => {
    const { service } = build();

    await expect(service.retry('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports whether email would actually leave the process', () => {
    expect(build().service.describeEmail()).toEqual({ configured: true, transport: 'recording' });
    expect(build(new NoopMailSender()).service.describeEmail().configured).toBe(false);
  });
});

describe('notification templates', () => {
  const base = {
    storeName: 'Nit Store',
    storeUrl: 'https://shop.example',
    supportEmail: 'support@nit.example',
  };

  it('renders money from paise, never re-multiplied', () => {
    expect(formatMoney(194_900, 'INR')).toContain('1,949.00');
    expect(renderNotification({
      ...base,
      type: 'order_placed',
      audience: 'customer',
      data: ORDER_DATA,
    }).body).toContain('1,949.00');
  });

  it('escapes what a customer typed', () => {
    const rendered = renderNotification({
      ...base,
      type: 'order_cancelled',
      audience: 'customer',
      data: { ...ORDER_DATA, reason: '<script>alert(1)</script>' },
    });

    expect(rendered.emailHtml).not.toContain('<script>');
    expect(rendered.emailHtml).toContain('&lt;script&gt;');
    // The plain-text body keeps the raw text — it is not markup.
    expect(rendered.emailText).toContain('<script>');
  });

  it('links customers to their order and operators to the console', () => {
    expect(
      renderNotification({
        ...base,
        type: 'order_shipped',
        audience: 'customer',
        data: ORDER_DATA,
      }).link,
    ).toBe('/account/orders/order-1/tracking');
    expect(
      renderNotification({
        ...base,
        type: 'order_placed',
        audience: 'admin',
        data: ORDER_DATA,
      }).link,
    ).toBe('/admin/orders/order-1');
  });

  it('builds absolute links in the email and a greeting from the name', () => {
    const rendered = renderNotification({
      ...base,
      type: 'order_placed',
      audience: 'customer',
      recipientName: 'Asha Rao',
      data: ORDER_DATA,
    });

    expect(rendered.emailHtml).toContain('href="https://shop.example/account/orders/order-1"');
    expect(rendered.emailText.startsWith('Hi Asha Rao,')).toBe(true);
  });
});
