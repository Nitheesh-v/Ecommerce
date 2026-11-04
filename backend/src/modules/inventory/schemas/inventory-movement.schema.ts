import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';

/** Why a stock movement happened. */
export const MOVEMENT_TYPES = [
  'initial', // stock entered with the product (creation)
  'adjustment', // an admin edited the quantity
  'order', // an order reserved/decremented stock
  'cancellation', // an eligible order was cancelled → stock returned
  'return', // a refund/return put the item back
  'correction', // reconciliation after a stock count
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Reasons offered by the admin stock-adjustment form. */
export const ADJUSTMENT_REASONS = [
  'new_stock',
  'damaged',
  'manual_correction',
  'returned',
  'purchase_return',
  'other',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const MOVEMENT_DIRECTIONS = ['increase', 'decrease'] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

const performedBySchema = new MongooseSchema(
  {
    userId: { type: String, required: false },
    email: { type: String, required: false },
  },
  { _id: false },
);

/**
 * Immutable audit record of one stock change.
 *
 * Deliberately **append-only**:
 * - there is no update or delete endpoint, and none is planned;
 * - the product name/SKU are snapshotted, so editing a product never rewrites
 *   history ("historical orders remain unchanged when details are edited");
 * - `previousQuantity` / `changedQuantity` / `newQuantity` together make each row
 *   verifiable on its own, so a gap in the chain cannot hide.
 *
 * `referenceId` exists for events that may be delivered more than once (order
 * placement, cancellations, payment webhooks). The partial unique index
 * `{ referenceId, type }` turns a replay into a no-op instead of a second
 * adjustment.
 */
@Schema({ collection: 'inventory_movements', timestamps: { createdAt: true, updatedAt: false } })
export class InventoryMovement {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  /** Snapshot — history must not change when the product is renamed/re-SKU'd. */
  @Prop({ type: String, required: true, trim: true })
  productName!: string;

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  sku!: string;

  @Prop({ type: String, enum: MOVEMENT_TYPES, required: true })
  type!: MovementType;

  @Prop({ type: String, enum: ADJUSTMENT_REASONS, required: false })
  reason?: AdjustmentReason;

  @Prop({ type: String, trim: true, maxlength: 500 })
  notes?: string;

  @Prop({ type: String, enum: MOVEMENT_DIRECTIONS, required: true })
  direction!: MovementDirection;

  @Prop({ type: Number, required: true, min: 0 })
  previousQuantity!: number;

  /** Signed: positive for increases, negative for decreases. */
  @Prop({ type: Number, required: true })
  changedQuantity!: number;

  @Prop({ type: Number, required: true, min: 0 })
  newQuantity!: number;

  /** Who caused it. Absent for system events such as order hooks. */
  @Prop({ type: performedBySchema, default: null })
  performedBy?: { userId?: string; email?: string } | null;

  /** External event key (order id, webhook id) — enables idempotent replays. */
  @Prop({ type: String, trim: true, maxlength: 120 })
  referenceId?: string;

  /** Free label for the source of the event, e.g. `order`, `webhook`, `admin`. */
  @Prop({ type: String, trim: true, maxlength: 40 })
  source?: string;

  createdAt!: Date;
}

export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;

export const InventoryMovementSchema =
  SchemaFactory.createForClass(InventoryMovement);

// Product drill-down and the global feed (newest first).
InventoryMovementSchema.index({ productId: 1, createdAt: -1 });
InventoryMovementSchema.index({ createdAt: -1 });
// Filtering the audit trail by kind of movement.
InventoryMovementSchema.index({ type: 1, createdAt: -1 });
// Idempotency: one movement per external event/type pair.
InventoryMovementSchema.index(
  { referenceId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { referenceId: { $type: 'string' } },
    name: 'uniq_reference_type',
  },
);
