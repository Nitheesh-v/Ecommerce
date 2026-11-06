// src/modules/addresses/schemas/address.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * Saved delivery addresses.
 *
 * A separate collection rather than an array on the user document: checkout only
 * ever needs *one* address by id, and keeping addresses out of `users` means the
 * auth projection can never accidentally serialise somebody's address book.
 *
 * The fields mirror the order's `shippingAddress` snapshot exactly, so placing an
 * order is a straight copy — no translation layer that could drop a line.
 */
@Schema({ ...baseSchemaOptions, collection: 'addresses' })
export class Address {
  @Prop({ type: 'ObjectId', ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /** "Home", "Office" — a label the customer recognises, not an address. */
  @Prop({ type: String, default: 'Home', trim: true, maxlength: 40 })
  label!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  recipientName!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 20 })
  phone!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  line1!: string;

  @Prop({ type: String, default: null, trim: true, maxlength: 200 })
  line2!: string | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  city!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  state!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 16 })
  postalCode!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 80, default: 'India' })
  country!: string;

  /** Exactly one default per customer, enforced by the service. */
  @Prop({ type: Boolean, default: false })
  isDefault!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AddressDocument = HydratedDocument<Address>;

export const AddressSchema = SchemaFactory.createForClass(Address);

AddressSchema.index({ userId: 1, createdAt: -1 });
