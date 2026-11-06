// src/modules/notifications/repositories/mongoose-notifications.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types } from 'mongoose';
import type { Model, PipelineStage } from 'mongoose';
import { escapeRegex } from '../../../common/utils/regex.util.js';
import { getSkip } from '../../../common/utils/pagination.util.js';
import { Notification } from '../schemas/notification.schema.js';
import type { NotificationAudience } from '../schemas/notification.schema.js';
import { NotificationsRepository } from './notifications.repository.js';
import type {
  CreateNotificationInput,
  NotificationListFilter,
  NotificationPatch,
  NotificationRecord,
  NotificationStats,
} from './notifications.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function toRecord(document: AnyDocument): NotificationRecord {
  return {
    id: String(document._id),
    type: document.type,
    category: document.category,
    audience: document.audience,
    userId: document.userId ?? null,
    recipientEmail: document.recipientEmail,
    recipientName: document.recipientName ?? null,
    title: document.title,
    body: document.body,
    link: document.link ?? null,
    data: document.data ?? {},
    emailSubject: document.emailSubject,
    emailText: document.emailText,
    emailHtml: document.emailHtml,
    emailStatus: document.emailStatus,
    emailError: document.emailError ?? null,
    emailSentAt: document.emailSentAt ?? null,
    readAt: document.readAt ?? null,
    attempts: document.attempts ?? 0,
    lastAttemptAt: document.lastAttemptAt ?? null,
    dedupeKey: document.dedupeKey ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

/** Builds the shared `$match` for a feed. */
function toMatch(filter: NotificationListFilter): Record<string, unknown> {
  const match: Record<string, unknown> = { audience: filter.audience };

  // `undefined` means "every customer" (the admin console's support view); an
  // explicit `null` means the store's email-only/guest rows.
  if (filter.audience === 'customer' && filter.userId !== undefined) {
    match.userId = filter.userId;
  }

  if (filter.unreadOnly) {
    match.readAt = null;
  }
  if (filter.type) {
    match.type = filter.type;
  }
  if (filter.category) {
    match.category = filter.category;
  }
  if (filter.emailStatus) {
    match.emailStatus = filter.emailStatus;
  }
  if (filter.from || filter.to) {
    match.createdAt = {
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lte: filter.to } : {}),
    };
  }
  if (filter.search?.trim()) {
    const pattern = new RegExp(escapeRegex(filter.search.trim()), 'i');
    match.$or = [{ title: pattern }, { body: pattern }, { recipientEmail: pattern }];
  }

  return match;
}

@Injectable()
export class MongoNotificationsRepository implements NotificationsRepository {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  /**
   * Inserts a row, honouring the unique `dedupeKey`.
   *
   * The duplicate is caught *here* rather than pre-checked: two concurrent
   * deliveries of the same webhook would both pass a read-then-write check.
   *
   * @returns `null` when the key already exists.
   */
  async create(input: CreateNotificationInput): Promise<NotificationRecord | null> {
    try {
      const document = await this.notificationModel.create({
        ...input,
        link: input.link ?? null,
        emailError: input.emailError ?? null,
        data: input.data ?? {},
        dedupeKey: input.dedupeKey ?? null,
      });

      return toRecord(document.toObject() as AnyDocument);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return null;
      }

      throw error;
    }
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.notificationModel
      .findById(new Types.ObjectId(id))
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async list(
    filter: NotificationListFilter,
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    const match = toMatch(filter);
    const direction = filter.sortOrder === 'asc' ? 1 : -1;

    const [documents, total] = await Promise.all([
      this.notificationModel
        .find(match)
        .sort({ createdAt: direction })
        .skip(getSkip(filter.page, filter.limit))
        .limit(filter.limit)
        .lean<AnyDocument[]>(),
      this.notificationModel.countDocuments(match),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      audience: 'customer',
      userId,
      readAt: null,
    });
  }

  async markRead(id: string, userId: string): Promise<NotificationRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.notificationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), audience: 'customer', userId },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.notificationModel.updateMany(
      { audience: 'customer', userId, readAt: null },
      { $set: { readAt: new Date() } },
    );

    return result.modifiedCount ?? 0;
  }

  async markReadAsAdmin(id: string): Promise<NotificationRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.notificationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), audience: 'admin' },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async update(id: string, patch: NotificationPatch): Promise<NotificationRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.notificationModel
      .findByIdAndUpdate(new Types.ObjectId(id), { $set: patch }, { new: true })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async stats(
    audience: NotificationAudience,
    userId?: string | null,
  ): Promise<NotificationStats> {
    const scope: Record<string, unknown> =
      audience === 'customer' ? { audience, userId: userId ?? null } : { audience };

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // One aggregation instead of six round-trips: the console asks for this on
    // every page load.
    const [row] = await this.notificationModel.aggregate<{
      total: number;
      unread: number;
      emailDelivered: number;
      emailSkipped: number;
      emailFailed: number;
      last24h: number;
    }>([
      { $match: scope },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ['$readAt', null] }, 1, 0] } },
          emailDelivered: {
            $sum: { $cond: [{ $eq: ['$emailStatus', 'delivered'] }, 1, 0] },
          },
          emailSkipped: { $sum: { $cond: [{ $eq: ['$emailStatus', 'skipped'] }, 1, 0] } },
          emailFailed: { $sum: { $cond: [{ $eq: ['$emailStatus', 'failed'] }, 1, 0] } },
          last24h: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] } },
        },
      },
      { $project: { _id: 0 } },
    ] as PipelineStage[]);

    return (
      row ?? {
        total: 0,
        unread: 0,
        emailDelivered: 0,
        emailSkipped: 0,
        emailFailed: 0,
        last24h: 0,
      }
    );
  }
}
