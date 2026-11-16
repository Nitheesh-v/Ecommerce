// src/modules/cart/schemas/cart.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * Server-side cart.
 *
 * One document per owner, where an owner is a customer (`cart:<userId>`) or an
 * anonymous shopper (`guest:<token>`). Prices are **never** stored as the source of
 * truth: `priceAtAdd` is a snapshot kept for display ("price when you added it"),
 * and every total is recomputed from the live product record when the cart is read.
 */
export interface CartItemRecordStored {
  productId: Types.ObjectId;
  quantity: number;
  /** Charged price (minor units) at the moment it was added — display only. */
  priceAtAdd: number;
  addedAt: Date;
}

const cartItemSchema = new MongooseSchema(
  {
    productId: { type: 'ObjectId', ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    priceAtAdd: { type: Number, required: true, min: 0 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

@Schema({ ...baseSchemaOptions, collection: 'carts' })
export class Cart {
  /**
   * `cart:<userId>` or `guest:<token>`.
   *
   * Documents written before guest carts existed hold the bare user id. The
   * repository still matches those (it queries both forms), so no migration is
   * needed and no live cart is lost on deploy.
   */
  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  ownerId!: string;

  /** Convenience for admin queries and support; `null` for a guest cart. */
  @Prop({ type: String, default: null, index: true })
  userId!: string | null;

  /** Set when a guest cart was merged into an account; retired carts are ignored. */
  @Prop({ type: Date, default: null })
  retiredAt!: Date | null;

  @Prop({ type: [cartItemSchema], default: [] })
  items!: CartItemRecordStored[];

  /**
   * The code the customer applied. A code is only ever *stored* — it is re-priced
   * against the current cart on every read, so an expired coupon or a cart that no
   * longer meets the minimum cannot linger as a stale discount.
   */
  @Prop({ type: String, default: null, uppercase: true, trim: true, maxlength: 40 })
  couponCode!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CartDocument = HydratedDocument<Cart>;

export const CartSchema = SchemaFactory.createForClass(Cart);

// One cart per owner; the unique index is the concurrency guard for `save()`.
CartSchema.index({ ownerId: 1 }, { unique: true });

// Guest carts are disposable. A TTL of 60 days keeps the collection from growing
// forever without ever expiring a basket someone is still shopping in; MongoDB's
// TTL monitor removes them on its own schedule, long after the last write.
CartSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 60, partialFilterExpression: { userId: null } },
);
