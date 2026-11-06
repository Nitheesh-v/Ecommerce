// src/modules/cart/schemas/cart.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * Server-side cart.
 *
 * One document per customer (`userId` is unique), which is what makes "my cart" a
 * single read and a single write. Prices are **never** stored as the source of
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
  @Prop({ type: 'ObjectId', ref: 'User', required: true, unique: true, index: true })
  userId!: Types.ObjectId;

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

// One cart per customer; the unique index is the concurrency guard for `save()`.
CartSchema.index({ userId: 1 }, { unique: true });
