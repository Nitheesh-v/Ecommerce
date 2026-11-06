// src/modules/notifications/schemas/notification.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/**
 * What a notification is about. Categories drive the console filters and the
 * icons the storefront renders; types drive the template that produced it.
 */
export const NOTIFICATION_CATEGORIES = [
  'order',
  'payment',
  'shipping',
  'inventory',
  'review',
  'account',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_TYPES = [
  'order_placed',
  'order_confirmed',
  'order_shipped',
  'order_out_for_delivery',
  'order_delivered',
  'order_cancelled',
  'payment_failed',
  'refund_processed',
  'delivery_failed',
  'inventory_low',
  'inventory_out',
  'review_submitted',
  'welcome',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Who the row belongs to.
 *
 * `customer` rows carry the `userId` they belong to and are only ever readable by
 * that customer. `admin` rows belong to the shop: they have no `userId` and are
 * readable by anyone with the admin role — an operator alert is not a shopper's
 * message, and mixing the two audiences in one feed is how internal notes leak.
 */
export const NOTIFICATION_AUDIENCES = ['customer', 'admin'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/**
 * Delivery state of the email half of a notification.
 *
 * `skipped` is a first-class outcome, not an error: with no SMTP credentials the
 * message is still recorded in-app, and pretending it was emailed would be a lie.
 */
export const NOTIFICATION_EMAIL_STATUSES = [
  'pending',
  'delivered',
  'failed',
  'skipped',
] as const;
export type NotificationEmailStatus = (typeof NOTIFICATION_EMAIL_STATUSES)[number];

/** Free-form values the template interpolates (`orderNumber`, `amount`, …). */
export type NotificationData = Record<string, string | number | null | undefined>;

@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ type: String, required: true, enum: NOTIFICATION_TYPES, index: true })
  type!: NotificationType;

  @Prop({ type: String, required: true, enum: NOTIFICATION_CATEGORIES, index: true })
  category!: NotificationCategory;

  @Prop({ type: String, required: true, enum: NOTIFICATION_AUDIENCES, index: true })
  audience!: NotificationAudience;

  /** The customer this row belongs to; `null` for shop-wide (admin) rows. */
  @Prop({ type: String, default: null, index: true })
  userId!: string | null;

  @Prop({ type: String, required: true })
  recipientEmail!: string;

  @Prop({ type: String, default: null })
  recipientName!: string | null;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  body!: string;

  /** Relative in-app link (`/account/orders/…`, `/admin/orders/…`); `null` if none. */
  @Prop({ type: String, default: null })
  link!: string | null;

  /** Snapshot of the values the message was built from, for support and audit. */
  @Prop({ type: Object, default: {} })
  data!: NotificationData;

  @Prop({ type: String, required: true })
  emailSubject!: string;

  /** The plain-text email body. Stored so the console can show what was sent. */
  @Prop({ type: String, required: true })
  emailText!: string;

  @Prop({ type: String, required: true })
  emailHtml!: string;

  @Prop({
    type: String,
    required: true,
    enum: NOTIFICATION_EMAIL_STATUSES,
    default: 'pending',
    index: true,
  })
  emailStatus!: NotificationEmailStatus;

  @Prop({ type: String, default: null })
  emailError!: string | null;

  @Prop({ type: Date, default: null })
  emailSentAt!: Date | null;

  /** When the customer (or an operator) opened it; `null` until then. */
  @Prop({ type: Date, default: null, index: true })
  readAt!: Date | null;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  lastAttemptAt!: Date | null;

  /**
   * Event identity (`order_placed:<orderId>`), unique when present.
   *
   * The order bus is best-effort and a webhook can replay, so the same event may
   * arrive twice. A unique sparse index makes the second insert a no-op instead of
   * a duplicate email.
   */
  @Prop({ type: String, default: null })
  dedupeKey!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// A customer reads their own feed newest-first; an operator reads the admin feed.
NotificationSchema.index({ audience: 1, userId: 1, createdAt: -1 });
NotificationSchema.index({ audience: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ emailStatus: 1, createdAt: -1 });
NotificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
