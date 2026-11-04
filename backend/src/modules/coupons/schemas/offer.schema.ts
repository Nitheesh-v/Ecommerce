import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * Offers & coupons.
 *
 * An **offer** is the campaign (what the discount is, when it runs, who may use
 * it, which products it covers). A **redemption** is the fact that a particular
 * order used it — recorded separately so limits can be counted atomically and the
 * audit trail survives edits to the offer.
 *
 * Nothing here recalculates money on an existing order: an order keeps its own
 * `couponCode` + `couponDiscount` snapshot, and changing an offer later never
 * rewrites history.
 */

export const DISCOUNT_TYPES = ['percentage', 'fixed', 'free_shipping'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: 'Percentage',
  fixed: 'Fixed amount',
  free_shipping: 'Free shipping',
};

/** Stored switch. The *displayed* status is derived — see `offer-status.ts`. */
export const OFFER_LIFECYCLE_STATUSES = [
  'active',
  'scheduled',
  'expired',
  'exhausted',
  'inactive',
] as const;
export type OfferLifecycleStatus = (typeof OFFER_LIFECYCLE_STATUSES)[number];

const actorSchema = new MongooseSchema(
  {
    userId: { type: String },
    email: { type: String },
  },
  { _id: false },
);

const offerHistorySchema = new MongooseSchema(
  {
    action: { type: String, required: true },
    note: { type: String },
    by: { type: actorSchema, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
);

@Schema({ ...baseSchemaOptions, collection: 'offers' })
export class Offer {
  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ type: String, trim: true, maxlength: 1000 })
  description?: string;

  /**
   * The code customers type. Stored uppercase; the unique index is
   * case-insensitive by construction (every write is normalised first).
   */
  @Prop({
    required: true,
    trim: true,
    uppercase: true,
    minlength: 3,
    maxlength: 32,
    unique: true,
  })
  code!: string;

  @Prop({ type: String, enum: DISCOUNT_TYPES, required: true })
  type!: DiscountType;

  /** Percentage points (1–100) or minor units for a fixed amount; 0 for free shipping. */
  @Prop({ type: Number, required: true, min: 0 })
  value!: number;

  /** Minimum eligible-goods value, minor units. 0 = no minimum. */
  @Prop({ type: Number, default: 0, min: 0 })
  minCartValue!: number;

  /** Cap for percentage offers, minor units. `null` = uncapped. */
  @Prop({ type: Number, default: null, min: 0 })
  maxDiscount!: number | null;

  @Prop({ type: Date, required: true })
  startsAt!: Date;

  @Prop({ type: Date, required: true })
  endsAt!: Date;

  /** `null` = unlimited. */
  @Prop({ type: Number, default: null, min: 1 })
  totalUsageLimit!: number | null;

  @Prop({ type: Number, default: 1, min: 1 })
  perCustomerLimit!: number;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  applicableProductIds!: Types.ObjectId[];

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  applicableCategoryIds!: Types.ObjectId[];

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  excludedProductIds!: Types.ObjectId[];

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  excludedCategoryIds!: Types.ObjectId[];

  /** Whether the offer may appear on the public `/offers` page. */
  @Prop({ type: Boolean, default: true })
  customerVisible!: boolean;

  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;

  /** Non-reversed reservations + redemptions; the limit counter. */
  @Prop({ type: Number, default: 0, min: 0 })
  usageCount!: number;

  /** Finalised redemptions only (money actually discounted on a confirmed order). */
  @Prop({ type: Number, default: 0, min: 0 })
  redeemedCount!: number;

  @Prop({ type: actorSchema, default: null })
  createdBy!: { userId?: string; email?: string } | null;

  @Prop({ type: actorSchema, default: null })
  updatedBy!: { userId?: string; email?: string } | null;

  @Prop({ type: [offerHistorySchema], default: [] })
  history!: Array<{
    action: string;
    note?: string;
    by?: { userId?: string; email?: string } | null;
    at: Date;
  }>;
}

export const OfferSchema = SchemaFactory.createForClass(Offer);

OfferSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
OfferSchema.index({ customerVisible: 1, isActive: 1 });
OfferSchema.index({ createdAt: -1 });

// --------------------------------------------------------------- redemptions

export const REDEMPTION_STATUSES = ['reserved', 'redeemed', 'reversed'] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

@Schema({ ...baseSchemaOptions, collection: 'coupon_redemptions' })
export class CouponRedemption {
  /** Stable id issued before the order exists, so a retry can find its own row. */
  @Prop({ required: true, unique: true })
  redemptionId!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Offer', required: true, index: true })
  offerId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  code!: string;

  /** Snapshot of the rule at redemption time — the offer may change later. */
  @Prop({ type: String, enum: DISCOUNT_TYPES, required: true })
  type!: DiscountType;

  @Prop({ type: Number, required: true, min: 0 })
  value!: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order', default: null, index: true })
  orderId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  orderNumber!: string | null;

  @Prop({ type: String, default: null, index: true })
  userId!: string | null;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  customerEmail!: string;

  /** Goods discount applied to the order, minor units. */
  @Prop({ type: Number, required: true, min: 0 })
  discountAmount!: number;

  @Prop({ type: Boolean, default: false })
  freeShipping!: boolean;

  @Prop({ type: String, enum: REDEMPTION_STATUSES, default: 'reserved', index: true })
  status!: RedemptionStatus;

  @Prop({ type: Date, required: true })
  reservedAt!: Date;

  @Prop({ type: Date, default: null })
  redeemedAt!: Date | null;

  @Prop({ type: Date, default: null })
  reversedAt!: Date | null;

  @Prop({ type: String, default: null })
  reversalReason!: string | null;
}

export const CouponRedemptionSchema = SchemaFactory.createForClass(CouponRedemption);

// One redemption row per (offer, order): the database, not a read-check, prevents
// a double redemption under concurrent retries.
CouponRedemptionSchema.index(
  { offerId: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } },
);
CouponRedemptionSchema.index({ status: 1, redeemedAt: -1 });

/** Per-customer counters, keyed by `offerId:customerKey`, incremented atomically. */
@Schema({ ...baseSchemaOptions, collection: 'coupon_customer_usage' })
export class CouponCustomerUsage {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Offer', required: true, index: true })
  offerId!: Types.ObjectId;

  @Prop({ required: true })
  customerKey!: string;

  @Prop({ type: Number, default: 0, min: 0 })
  count!: number;
}

export const CouponCustomerUsageSchema =
  SchemaFactory.createForClass(CouponCustomerUsage);
