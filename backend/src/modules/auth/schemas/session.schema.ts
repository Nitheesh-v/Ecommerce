import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * A refresh session — one per login (device).
 *
 * The refresh token itself is never stored: only its SHA-256 hash. A database
 * leak therefore cannot be replayed against the API.
 */
@Schema({ ...baseSchemaOptions, collection: 'sessions' })
export class Session {
  /** Hex ObjectId of the owning user (stored as a string: sessions never populate). */
  @Prop({ type: String, required: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  /** Hash of the token that replaced this one during rotation (audit trail). */
  @Prop({ type: String, default: null })
  replacedByTokenHash!: string | null;

  @Prop({ type: String, maxlength: 300 })
  userAgent?: string;

  @Prop({ type: String, maxlength: 60 })
  ipAddress?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SessionDocument = HydratedDocument<Session>;

export const SessionSchema = SchemaFactory.createForClass(Session);

// MongoDB removes expired sessions automatically (revoked ones are kept until
// they expire, which is what makes reuse detection possible within the window).
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
