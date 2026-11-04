import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

export const ALERT_LEVELS = ['low', 'out'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export const ALERT_STATUSES = ['open', 'resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * One row per *open* stock problem.
 *
 * Deduplication rule: a product can have at most one open alert per level, which
 * a partial unique index enforces. Repeated stock updates in the same state
 * therefore cannot spam the alert feed — the service upserts and only notifies
 * when the state actually changes (low ⇄ out ⇄ in).
 */
@Schema({ collection: 'inventory_alerts', timestamps: true })
export class InventoryAlert {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  productName!: string;

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  sku!: string;

  @Prop({ type: String, enum: ALERT_LEVELS, required: true })
  level!: AlertLevel;

  @Prop({ type: String, enum: ALERT_STATUSES, default: 'open', required: true })
  status!: AlertStatus;

  /** Quantity at the moment the alert opened (for context in the UI). */
  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  @Prop({ type: Number, required: true, min: 0 })
  lowStockThreshold!: number;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type InventoryAlertDocument = HydratedDocument<InventoryAlert>;

export const InventoryAlertSchema = SchemaFactory.createForClass(InventoryAlert);

// At most one open alert per product and level.
InventoryAlertSchema.index(
  { productId: 1, level: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'open' },
    name: 'uniq_open_alert_per_level',
  },
);
// The alert feed: open alerts, newest first.
InventoryAlertSchema.index({ status: 1, createdAt: -1 });
