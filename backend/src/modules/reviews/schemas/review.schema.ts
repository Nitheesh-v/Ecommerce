import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * Product reviews.
 *
 * A review is only accepted from a customer who has a **delivered** order
 * containing the product, so every row carries the order that proves it. Rows are
 * created `pending` and only appear on the storefront once an admin approves them;
 * the moderator and the reason are recorded on the same document so the decision
 * does not live in a separate audit table.
 *
 * One review per customer per product is enforced by a unique index rather than a
 * read-then-write check, so a double submit cannot slip in between.
 */

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** Who made the moderation decision. */
const moderatorSchema = new MongooseSchema(
  {
    userId: { type: String, default: null },
    email: { type: String, required: true },
  },
  { _id: false },
);

@Schema({ ...baseSchemaOptions, collection: 'reviews' })
export class Review {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  })
  productId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  customerName!: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  customerEmail!: string;

  /** The delivered order that verifies the purchase. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order', required: true })
  orderId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  orderNumber!: string;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ type: String, default: null, trim: true, maxlength: 120 })
  title!: string | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  comment!: string;

  @Prop({ type: String, enum: REVIEW_STATUSES, default: 'pending', index: true })
  status!: ReviewStatus;

  @Prop({ type: moderatorSchema, default: null })
  moderatedBy!: { userId: string | null; email: string } | null;

  @Prop({ type: Date, default: null })
  moderatedAt!: Date | null;

  @Prop({ type: String, default: null, maxlength: 300 })
  moderationReason!: string | null;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// One review per customer per product — the database refuses the second one, so a
// double submit or a retried request cannot create a duplicate.
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

// The storefront reads approved reviews, newest first, for one product.
ReviewSchema.index({ productId: 1, status: 1, createdAt: -1 });

// The admin queue is "pending, oldest first"; the console also filters by status alone.
ReviewSchema.index({ status: 1, createdAt: -1 });

// A customer's own review history.
ReviewSchema.index({ userId: 1, createdAt: -1 });
