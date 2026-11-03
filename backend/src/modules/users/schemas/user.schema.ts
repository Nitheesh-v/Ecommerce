import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { Role } from '../../../common/enums/role.enum.js';
import { baseSchemaOptions } from '../../../database/base.schema.js';

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

  @Prop({ type: Boolean, default: true, required: true })
  isActive!: boolean;

  /** Populated by `baseSchemaOptions.timestamps`. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);
