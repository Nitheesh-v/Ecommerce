import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/** Lifecycle of an order. Transitions are validated in `order-status.ts`. */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'return_requested',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Payment state, stored **top level** because the admin dashboard aggregates on
 * it (`paymentStatus: 'paid'` is the definition of revenue).
 */
export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refund_pending',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  'cod',
  'card',
  'upi',
  'netbanking',
  'wallet',
  'manual',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPPING_METHODS = ['standard', 'express', 'same_day', 'pickup'] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'received',
  'inspected',
  'restocked',
  'refunded',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const REFUND_STATUSES = ['pending', 'processed', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** What an entry in `history[]` records. */
export const HISTORY_KINDS = [
  'status',
  'payment',
  'shipping',
  'cancellation',
  'return',
  'refund',
  'note',
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

const actorSchema = new MongooseSchema(
  {
    userId: { type: String },
    email: { type: String, lowercase: true },
  },
  { _id: false },
);

/**
 * Product snapshot.
 *
 * Names, SKUs, images and prices are copied at purchase time on purpose: editing
 * or deleting a product later must never change what a customer was charged or
 * what an invoice says.
 */
const orderItemSchema = new MongooseSchema(
  {
    productId: { type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    imageUrl: { type: String, default: null },
    /** Unit price actually charged, minor units. */
    unitPrice: { type: Number, required: true, min: 0 },
    /** List price at purchase time (for "you saved" displays). */
    listPrice: { type: Number, required: true, min: 0 },
    /** Per-line discount, minor units. */
    discount: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    /** `unitPrice × quantity − discount`. */
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const addressSchema = new MongooseSchema(
  {
    recipientName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 16 },
    country: { type: String, required: true, trim: true, default: 'India', maxlength: 80 },
  },
  { _id: false },
);

const shippingSchema = new MongooseSchema(
  {
    provider: { type: String, required: false, trim: true, maxlength: 60 },
    trackingNumber: { type: String, required: false, trim: true, maxlength: 80 },
    trackingUrl: { type: String, required: false, trim: true, maxlength: 500 },
    shippedAt: { type: Date, required: false },
    estimatedDelivery: { type: Date, required: false },
    deliveredAt: { type: Date, required: false },
    /** Free-form notes the admin leaves while fulfilling. */
    notes: {
      type: [
        new MongooseSchema(
          {
            note: { type: String, required: true, trim: true, maxlength: 500 },
            at: { type: Date, required: true },
            by: { type: String, required: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const refundSchema = new MongooseSchema(
  {
    /** Stable id so a specific refund can be addressed and de-duplicated. */
    refundId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: REFUND_STATUSES, required: true, default: 'pending' },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    /** Gateway/bank reference once it actually happened. */
    reference: { type: String, required: false, trim: true, maxlength: 120 },
    requestedAt: { type: Date, required: true },
    requestedBy: { type: actorSchema, default: null },
    processedAt: { type: Date, required: false },
    processedBy: { type: actorSchema, default: null },
    note: { type: String, required: false, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const paymentSchema = new MongooseSchema(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    /** Gateway transaction id; absent for COD until collected. */
    transactionId: { type: String, required: false, trim: true, maxlength: 120 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date, required: false },
    refunds: { type: [refundSchema], default: [] },
  },
  { _id: false },
);

const returnItemSchema = new MongooseSchema(
  {
    productId: { type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    /** Unit price snapshot, used to compute the refundable amount. */
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/**
 * Return request. Stock is restored only after an inspection explicitly approves
 * it (`restockApproved`), never on request or approval alone.
 */
const returnSchema = new MongooseSchema(
  {
    returnId: { type: String, required: true },
    status: { type: String, enum: RETURN_STATUSES, required: true, default: 'requested' },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    note: { type: String, required: false, trim: true, maxlength: 1000 },
    items: { type: [returnItemSchema], required: true },
    /** Money the customer would get back if this return is completed. */
    refundableAmount: { type: Number, default: 0, min: 0 },
    inspectionNotes: { type: String, required: false, trim: true, maxlength: 1000 },
    inspectionPassed: { type: Boolean, required: false },
    restockApproved: { type: Boolean, default: false },
    restockedAt: { type: Date, required: false },
    refundId: { type: String, required: false },
    requestedAt: { type: Date, required: true },
    requestedBy: { type: actorSchema, default: null },
    decidedAt: { type: Date, required: false },
    decidedBy: { type: actorSchema, default: null },
    decisionNote: { type: String, required: false, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const cancellationSchema = new MongooseSchema(
  {
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    note: { type: String, required: false, trim: true, maxlength: 1000 },
    cancelledAt: { type: Date, required: true },
    cancelledBy: { type: actorSchema, default: null },
    /** True once every line has been returned to stock (once, never twice). */
    restocked: { type: Boolean, default: false },
    restockedAt: { type: Date, required: false },
  },
  { _id: false },
);

const historySchema = new MongooseSchema(
  {
    kind: { type: String, enum: HISTORY_KINDS, required: true },
    /** Null for the first entry (`from` has no previous state). */
    from: { type: String, required: false },
    to: { type: String, required: false },
    reason: { type: String, required: false, trim: true, maxlength: 500 },
    note: { type: String, required: false, trim: true, maxlength: 1000 },
    by: { type: actorSchema, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * An order.
 *
 * Everything a customer was charged is snapshotted on the document; the product
 * collection is only read while the order is being created. `history[]` is the
 * audit trail and is append-only — no endpoint mutates or removes an entry.
 *
 * Field names are deliberately aligned with the dashboard aggregations
 * (`total`, `paymentStatus`, `status`, `createdAt`, `items[].unitPrice`) and with
 * `ProductsRepository.countOrderReferences()` (`items[].productId`).
 */
@Schema({ ...baseSchemaOptions, collection: 'orders' })
export class Order {
  /** Human-facing id, e.g. `ORD-20261104-0007`. Unique. */
  @Prop({ type: String, required: true, unique: true, trim: true, index: true })
  orderNumber!: string;

  /** Null for guest checkout (the module supports it; the UI does not use it yet). */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  userId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 160 })
  customerName!: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true, maxlength: 254 })
  customerEmail!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 20 })
  customerPhone?: string;

  @Prop({ type: [orderItemSchema], required: true })
  items!: Array<{
    productId: Types.ObjectId;
    name: string;
    sku: string;
    imageUrl?: string | null;
    unitPrice: number;
    listPrice: number;
    discount: number;
    quantity: number;
    lineTotal: number;
  }>;

  // ---------------------------------------------------------------- pricing
  /** Σ line totals, minor units. */
  @Prop({ type: Number, required: true, min: 0 })
  subtotal!: number;

  /** Σ per-line discounts. */
  @Prop({ type: Number, default: 0, min: 0 })
  discountTotal!: number;

  @Prop({ type: String, required: false, trim: true, uppercase: true, maxlength: 40 })
  couponCode?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  couponDiscount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  shippingCharge!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  taxAmount!: number;

  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  taxRatePercent!: number;

  /** `subtotal − discountTotal − couponDiscount + shippingCharge + taxAmount`. */
  @Prop({ type: Number, required: true, min: 0 })
  total!: number;

  @Prop({ type: String, default: 'INR', required: true })
  currency!: string;

  // --------------------------------------------------------------- delivery
  @Prop({ type: addressSchema, required: true })
  shippingAddress!: {
    recipientName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };

  @Prop({ type: String, enum: SHIPPING_METHODS, default: 'standard', required: true })
  shippingMethod!: ShippingMethod;

  @Prop({ type: shippingSchema, default: () => ({}) })
  shipping?: {
    provider?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    shippedAt?: Date;
    estimatedDelivery?: Date;
    deliveredAt?: Date;
    notes: Array<{ note: string; at: Date; by?: string }>;
  };

  // ---------------------------------------------------------------- payment
  @Prop({ type: paymentSchema, required: true })
  payment!: {
    method: PaymentMethod;
    transactionId?: string;
    paidAmount: number;
    paidAt?: Date;
    refunds: Array<{
      refundId: string;
      amount: number;
      status: RefundStatus;
      reason: string;
      reference?: string;
      requestedAt: Date;
      requestedBy?: { userId?: string; email?: string } | null;
      processedAt?: Date;
      processedBy?: { userId?: string; email?: string } | null;
      note?: string;
    }>;
  };

  /** Denormalised top-level copies used by list filters and dashboard queries. */
  @Prop({ type: String, enum: PAYMENT_METHODS, required: true })
  paymentMethod!: PaymentMethod;

  @Prop({ type: String, enum: PAYMENT_STATUSES, default: 'pending', required: true })
  paymentStatus!: PaymentStatus;

  // ----------------------------------------------------------------- status
  @Prop({ type: String, enum: ORDER_STATUSES, default: 'pending', required: true })
  status!: OrderStatus;

  @Prop({ type: cancellationSchema, required: false })
  cancellation?: {
    reason: string;
    note?: string;
    cancelledAt: Date;
    cancelledBy?: { userId?: string; email?: string } | null;
    restocked: boolean;
    restockedAt?: Date;
  };

  @Prop({ type: [returnSchema], default: [] })
  returns!: Array<Record<string, unknown>>;

  /** Append-only audit trail (status, payment, shipping, refunds, notes). */
  @Prop({ type: [historySchema], default: [] })
  history!: Array<{
    kind: HistoryKind;
    from?: string;
    to?: string;
    reason?: string;
    note?: string;
    by?: { userId?: string; email?: string } | null;
    at: Date;
  }>;

  /** Customer/client supplied key making checkout retries idempotent. */
  @Prop({ type: String, required: false, trim: true, maxlength: 120 })
  idempotencyKey?: string;

  /** Set when the order is cancelled/returned, for reporting. */
  @Prop({ type: Date, default: null })
  closedAt?: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OrderDocument = import('mongoose').HydratedDocument<Order>;

export const OrderSchema = SchemaFactory.createForClass(Order);

// Admin list: newest first, filtered by status/payment/date.
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, createdAt: -1 });
// Customer "my orders".
OrderSchema.index({ userId: 1, createdAt: -1 });
// Idempotent checkout: one order per client key, across all customers.
OrderSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
    name: 'uniq_idempotency_key',
  },
);
