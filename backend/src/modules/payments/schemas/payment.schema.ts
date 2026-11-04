import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';
import { PAYMENT_METHODS } from '../../orders/schemas/order.schema.js';
import type { PaymentMethod } from '../../orders/schemas/order.schema.js';

/**
 * Lifecycle of one **gateway transaction attempt**.
 *
 * This is deliberately *not* the order's `paymentStatus`: an order can be paid
 * once, while a customer may attempt payment several times (each attempt is a
 * separate record here). Fulfilment status is a third, independent axis.
 *
 * `partially_refunded` / `refunded` are derived from the order's refund ledger —
 * refunds stay owned by the order, this record mirrors their totals so the console
 * can list and filter transaction by outcome.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'captured',
  'failed',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['razorpay', 'manual'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

@Schema({ ...baseSchemaOptions, collection: 'payments' })
export class Payment {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  })
  orderId!: Types.ObjectId;

  /** Copied from the order so a transaction list needs no join to be readable. */
  @Prop({ required: true, trim: true, index: true })
  orderNumber!: string;

  @Prop({ type: String, default: null, index: true })
  userId!: string | null;

  @Prop({ required: true, lowercase: true, trim: true })
  customerEmail!: string;

  @Prop({ required: true, trim: true })
  customerName!: string;

  /** Minor units (paise). Always the order total captured at creation time. */
  @Prop({ required: true, min: 1 })
  amount!: number;

  @Prop({ required: true, default: 'INR', uppercase: true, trim: true })
  currency!: string;

  @Prop({ type: String, required: true, enum: PAYMENT_PROVIDERS, default: 'razorpay' })
  provider!: PaymentProvider;

  @Prop({ type: String, required: true, enum: PAYMENT_METHODS, default: 'manual' })
  method!: PaymentMethod;

  @Prop({ type: String, required: true, enum: PAYMENT_STATUSES, default: 'pending', index: true })
  status!: PaymentStatus;

  /** Raw status reported by the gateway (`created`, `authorized`, `captured`…). */
  @Prop({ required: false, trim: true, maxlength: 40 })
  gatewayStatus?: string;

  /** `order_…` — one per attempt, unique across the collection. */
  @Prop({ required: false, trim: true, maxlength: 120 })
  gatewayOrderId?: string;

  /** `pay_…` — unique once captured; a second capture cannot reuse it. */
  @Prop({ required: false, trim: true, maxlength: 120 })
  gatewayPaymentId?: string;

  /** Set when the browser callback signature verified (checkout flow). */
  @Prop({ default: false })
  signatureVerified!: boolean;

  /** Set when the gateway itself confirmed the outcome (fetch or webhook). */
  @Prop({ default: false })
  verifiedWithGateway!: boolean;

  /** Safe, customer-facing failure text. Never a raw gateway payload. */
  @Prop({ required: false, trim: true, maxlength: 500 })
  failureReason?: string;

  @Prop({ required: false })
  capturedAt?: Date;

  @Prop({ required: false })
  failedAt?: Date;

  @Prop({ required: false })
  cancelledAt?: Date;

  /** Mirror of processed refunds on the linked order, minor units. */
  @Prop({ default: 0, min: 0 })
  refundedAmount!: number;

  /** Mirror of refunds queued but not yet paid out, minor units. */
  @Prop({ default: 0, min: 0 })
  pendingRefundAmount!: number;

  /** Last event type applied to this record (`payment.captured`, `refund.processed`…). */
  @Prop({ required: false, trim: true, maxlength: 80 })
  latestEvent?: string;

  @Prop({ required: false })
  lastEventAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// A gateway order/payment id identifies exactly one attempt, everywhere.
PaymentSchema.index(
  { gatewayOrderId: 1 },
  { unique: true, partialFilterExpression: { gatewayOrderId: { $type: 'string' } } },
);
PaymentSchema.index(
  { gatewayPaymentId: 1 },
  { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } },
);
PaymentSchema.index({ orderId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
