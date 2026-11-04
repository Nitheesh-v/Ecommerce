import type { PaymentEventSource } from '../schemas/payment-event.schema.js';

export interface PaymentEventRecord {
  id: string;
  eventId: string;
  paymentId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  type: string;
  source: PaymentEventSource;
  message: string;
  gatewayReference?: string;
  payloadHash?: string;
  receivedAt: Date;
}

export interface RecordPaymentEventInput {
  eventId: string;
  paymentId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  type: string;
  source: PaymentEventSource;
  message: string;
  gatewayReference?: string;
  payloadHash?: string;
  receivedAt?: Date;
}

/**
 * Append-only event log.
 *
 * `record()` returning `null` is the idempotency signal: the event was already
 * applied (typically a gateway webhook retry) and must not be applied again.
 * `release()` exists so a failed *application* can un-claim its event, letting a
 * later retry do the work instead of being silently skipped as a duplicate.
 */
export abstract class PaymentEventsRepository {
  abstract record(input: RecordPaymentEventInput): Promise<PaymentEventRecord | null>;

  abstract release(eventId: string): Promise<void>;

  abstract listForPayment(paymentId: string): Promise<PaymentEventRecord[]>;

  abstract listForOrder(orderId: string): Promise<PaymentEventRecord[]>;
}
