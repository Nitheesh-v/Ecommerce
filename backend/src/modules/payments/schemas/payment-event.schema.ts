import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

export const PAYMENT_EVENT_SOURCES = ['webhook', 'verify', 'admin', 'system'] as const;
export type PaymentEventSource = (typeof PAYMENT_EVENT_SOURCES)[number];

/**
 * Append-only audit log for money events, and the idempotency ledger for webhooks.
 *
 * `eventId` is unique: the same gateway event delivered twice (Razorpay retries on
 * any non-2xx, and retries again on its own schedule) inserts once and is then
 * recognised as a duplicate. Nothing here is ever updated in place — the history
 * endpoint reads it top-down.
 */
@Schema({ ...baseSchemaOptions, collection: 'payment_events' })
export class PaymentEvent {
  /** Gateway event id, or a body hash when the gateway did not send one. */
  @Prop({ required: true, unique: true, trim: true, maxlength: 200 })
  eventId!: string;

  @Prop({ type: String, default: null, index: true })
  paymentId!: string | null;

  @Prop({ type: String, default: null, index: true })
  orderId!: string | null;

  @Prop({ type: String, default: null, trim: true })
  orderNumber!: string | null;

  /** `payment.captured`, `refund.processed`, `checkout.verified`… */
  @Prop({ required: true, trim: true, maxlength: 80 })
  type!: string;

  @Prop({ type: String, required: true, enum: PAYMENT_EVENT_SOURCES })
  source!: PaymentEventSource;

  /** Human-readable summary shown in the timeline. Never contains secrets. */
  @Prop({ required: true, trim: true, maxlength: 500 })
  message!: string;

  /** Gateway order/payment/refund id the event relates to, when there is one. */
  @Prop({ required: false, trim: true, maxlength: 120 })
  gatewayReference?: string;

  /** SHA-256 of the exact bytes received; lets an auditor spot a changed body. */
  @Prop({ required: false, trim: true, maxlength: 64 })
  payloadHash?: string;
}

export const PaymentEventSchema = SchemaFactory.createForClass(PaymentEvent);

PaymentEventSchema.index({ paymentId: 1, createdAt: -1 });
PaymentEventSchema.index({ orderId: 1, createdAt: -1 });
