import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Role } from '../../../common/enums/role.enum.js';
import { baseSchemaOptions } from '../../../database/base.schema.js';
import {
  CUSTOMER_STATUSES,
  type CustomerStatus,
} from '../customer-status.js';

/**
 * One auditable account-status change. Append-only: nothing rewrites it, and it
 * keeps working when the account is later reactivated.
 */
const statusActorSchema = new MongooseSchema(
  {
    userId: { type: String, required: true },
    email: { type: String, required: true },
  },
  { _id: false },
);

const statusEntrySchema = new MongooseSchema(
  {
    from: { type: String, enum: CUSTOMER_STATUSES, required: true },
    to: { type: String, enum: CUSTOMER_STATUSES, required: true },
    reason: { type: String, trim: true, maxlength: 500 },
    note: { type: String, trim: true, maxlength: 500 },
    by: { type: statusActorSchema, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
);

@Schema({ ...baseSchemaOptions, collection: 'users' })
export class User {
  /** Stored lowercase + trimmed; unique index is the only guard against duplicates. */
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  })
  email!: string;

  /**
   * bcrypt hash. `select: false` keeps it out of every query by default; only a
   * repository method that explicitly asks for it can read it, so a stray
   * `findById()` can never serialise a hash into a response.
   */
  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  firstName!: string;

  @Prop({ type: String, trim: true, maxlength: 80 })
  lastName?: string;

  @Prop({ type: String, enum: Role, default: Role.Customer, required: true, index: true })
  role!: Role;

  /**
   * Derived mirror of `status === 'active'`.
   *
   * Kept because authentication, session refresh and guards have always read it;
   * both fields are written together so they can never disagree.
   */
  @Prop({ type: Boolean, default: true, required: true })
  isActive!: boolean;

  @Prop({
    type: String,
    enum: CUSTOMER_STATUSES,
    default: 'active',
    required: true,
    index: true,
  })
  status!: CustomerStatus;

  /** Optional contact details, filled at checkout/registration when supplied. */
  @Prop({ type: String, trim: true, maxlength: 20 })
  phone?: string;

  /** Reserved for a customer-facing profile UI; the console falls back to initials. */
  @Prop({ type: String, trim: true, maxlength: 2048 })
  avatarUrl?: string;

  /** Append-only account-status history (who changed it, why, when). */
  @Prop({ type: [statusEntrySchema], default: [] })
  statusHistory!: Array<{
    from: CustomerStatus;
    to: CustomerStatus;
    reason?: string;
    note?: string;
    by?: { userId: string; email: string } | null;
    at: Date;
  }>;

  /** Populated by `baseSchemaOptions.timestamps`. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

// Admin customer listing: filter by status, newest first.
UserSchema.index({ status: 1, createdAt: -1 });
