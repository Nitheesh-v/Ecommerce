import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * Parcel lifecycle — deliberately **separate** from the order's fulfilment status.
 *
 * An order answers "what was sold and how is the sale going"; a shipment answers
 * "where is this parcel". They are linked one-way: a shipment transition may
 * advance the order through legal order transitions, never the reverse.
 */
export const SHIPMENT_STATUSES = [
  'pending',
  'ready_to_ship',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned_to_sender',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_EVENT_TYPES = ['created', 'status', 'courier', 'note'] as const;
export type ShipmentEventType = (typeof SHIPMENT_EVENT_TYPES)[number];

export const SHIPMENT_EVENT_SOURCES = ['admin', 'system', 'courier'] as const;
export type ShipmentEventSource = (typeof SHIPMENT_EVENT_SOURCES)[number];

const actorSchema = new MongooseSchema(
  {
    userId: { type: String },
    email: { type: String, lowercase: true },
  },
  { _id: false },
);

const dimensionsSchema = new MongooseSchema(
  {
    /** Centimetres. */
    lengthCm: { type: Number, required: true, min: 1 },
    widthCm: { type: Number, required: true, min: 1 },
    heightCm: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

/** Append-only: entries are pushed in the same atomic update as the change. */
const shipmentEventSchema = new MongooseSchema(
  {
    eventId: { type: String, required: true },
    type: { type: String, enum: SHIPMENT_EVENT_TYPES, required: true },
    /** Status before the change (absent on `created`). */
    from: { type: String, enum: SHIPMENT_STATUSES, required: false },
    /** Status after the change (the status at that moment for `courier`/`note`). */
    to: { type: String, enum: SHIPMENT_STATUSES, required: false },
    note: { type: String, required: false, trim: true, maxlength: 500 },
    reason: { type: String, required: false, trim: true, maxlength: 500 },
    source: { type: String, enum: SHIPMENT_EVENT_SOURCES, required: true, default: 'admin' },
    by: { type: actorSchema, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const courierSchema = new MongooseSchema(
  {
    /** Integration id (`manual`, `shiprocket`, `delhivery`, `bluedart`). */
    provider: { type: String, required: true, trim: true, maxlength: 40 },
    /** Human-facing partner name as printed on the label. */
    name: { type: String, required: true, trim: true, maxlength: 80 },
    trackingNumber: { type: String, required: false, trim: true, maxlength: 80 },
    /** Only an explicitly supplied/tracked URL — never invented. */
    trackingUrl: { type: String, required: false, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const shipmentAddressSchema = new MongooseSchema(
  {
    recipientName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 16 },
    country: { type: String, required: true, trim: true, maxlength: 80, default: 'India' },
  },
  { _id: false },
);

@Schema({ ...baseSchemaOptions, collection: 'shipments' })
export class Shipment {
  /** `SHP-YYYYMMDD-NNNN`, unique. */
  @Prop({ required: true, unique: true, trim: true, maxlength: 40 })
  shipmentNumber!: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  })
  orderId!: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  orderNumber!: string;

  @Prop({ type: String, default: null, index: true })
  userId!: string | null;

  @Prop({ required: true, trim: true })
  customerName!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  customerEmail!: string;

  /** Address snapshot: the parcel goes to where the order said it would. */
  @Prop({ type: shipmentAddressSchema, required: true })
  shippingAddress!: {
    recipientName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };

  @Prop({ type: courierSchema, required: true })
  courier!: {
    provider: string;
    name: string;
    trackingNumber?: string;
    trackingUrl?: string;
  };

  @Prop({ type: String, required: true, enum: SHIPMENT_STATUSES, default: 'pending', index: true })
  status!: ShipmentStatus;

  /** Delivery charge paid to the courier, minor units. */
  @Prop({ type: Number, default: 0, min: 0 })
  shippingCost!: number;

  /** Grams. */
  @Prop({ type: Number, required: false, min: 1 })
  weightGrams?: number;

  @Prop({ type: dimensionsSchema, required: false })
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };

  /** Internal only — never returned on the customer tracking endpoint. */
  @Prop({ type: String, required: false, trim: true, maxlength: 1000 })
  notes?: string;

  @Prop({ type: Date, required: false })
  estimatedDelivery?: Date;

  @Prop({ type: Date, required: false })
  shippedAt?: Date;

  /** Set once, when the parcel is actually delivered. */
  @Prop({ type: Date, required: false })
  actualDelivery?: Date;

  @Prop({ required: false, trim: true, maxlength: 500 })
  failureReason?: string;

  @Prop({ type: actorSchema, default: null })
  createdBy!: { userId?: string; email?: string } | null;

  @Prop({ type: actorSchema, default: null })
  updatedBy!: { userId?: string; email?: string } | null;

  @Prop({ type: [shipmentEventSchema], default: [] })
  events!: Array<{
    eventId: string;
    type: ShipmentEventType;
    from?: ShipmentStatus;
    to?: ShipmentStatus;
    note?: string;
    reason?: string;
    source: ShipmentEventSource;
    by?: { userId?: string; email?: string } | null;
    at: Date;
  }>;
}

export const ShipmentSchema = SchemaFactory.createForClass(Shipment);

/**
 * At most one live shipment per order.
 *
 * `returned_to_sender` is the only status that releases the slot, which is what
 * makes "replacement shipment after a return" possible without ever allowing two
 * parcels to be in flight for the same order. A concurrent double-click loses the
 * insert and is reported as a conflict.
 */
ShipmentSchema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'returned_to_sender' } },
    name: 'one_live_shipment_per_order',
  },
);
ShipmentSchema.index({ status: 1, createdAt: -1 });
ShipmentSchema.index({ 'courier.trackingNumber': 1 });
