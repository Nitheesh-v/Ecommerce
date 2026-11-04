import { randomBytes } from 'node:crypto';
import { PaymentEventsRepository } from '../../src/modules/payments/repositories/payment-events.repository.js';
import type {
  PaymentEventRecord,
  RecordPaymentEventInput,
} from '../../src/modules/payments/repositories/payment-events.repository.js';

/**
 * In-memory event log.
 *
 * The unique `eventId` behaves like the Mongo unique index: a second delivery of
 * the same webhook is rejected with `null` instead of being stored twice.
 */
export class InMemoryPaymentEventsRepository implements PaymentEventsRepository {
  private readonly events: PaymentEventRecord[] = [];

  async record(input: RecordPaymentEventInput): Promise<PaymentEventRecord | null> {
    if (this.events.some((event) => event.eventId === input.eventId)) {
      return null;
    }

    const record: PaymentEventRecord = {
      id: newObjectIdLike(),
      eventId: input.eventId,
      paymentId: input.paymentId,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      type: input.type,
      source: input.source,
      message: input.message,
      gatewayReference: input.gatewayReference,
      payloadHash: input.payloadHash,
      receivedAt: input.receivedAt ?? new Date(),
    };

    this.events.push(record);

    return { ...record };
  }

  async release(eventId: string): Promise<void> {
    const index = this.events.findIndex((event) => event.eventId === eventId);

    if (index >= 0) {
      this.events.splice(index, 1);
    }
  }

  async listForPayment(paymentId: string): Promise<PaymentEventRecord[]> {
    return this.events
      .filter((event) => event.paymentId === paymentId)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .map((event) => ({ ...event }));
  }

  async listForOrder(orderId: string): Promise<PaymentEventRecord[]> {
    return this.events
      .filter((event) => event.orderId === orderId)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .map((event) => ({ ...event }));
  }

  reset(): void {
    this.events.length = 0;
  }

  all(): PaymentEventRecord[] {
    return this.events.map((event) => ({ ...event }));
  }
}

function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}
