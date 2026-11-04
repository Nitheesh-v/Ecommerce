import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { PaymentEvent } from '../schemas/payment-event.schema.js';
import { PaymentEventsRepository } from './payment-events.repository.js';
import type {
  PaymentEventRecord,
  RecordPaymentEventInput,
} from './payment-events.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DUPLICATE_KEY = 11_000;

@Injectable()
export class MongoPaymentEventsRepository implements PaymentEventsRepository {
  constructor(
    @InjectModel(PaymentEvent.name) private readonly eventModel: Model<PaymentEvent>,
  ) {}

  async record(input: RecordPaymentEventInput): Promise<PaymentEventRecord | null> {
    try {
      const document = await this.eventModel.create({
        ...input,
        paymentId: input.paymentId,
        orderId: input.orderId,
        // `createdAt` (from the schema's timestamps) is the received time.
      });

      return toRecord(document.toObject() as AnyDocument);
    } catch (error) {
      // The unique index on `eventId` is the idempotency guarantee: a retried
      // webhook loses the insert race and is reported as a duplicate.
      if (isDuplicateKeyError(error)) {
        return null;
      }

      throw error;
    }
  }

  async release(eventId: string): Promise<void> {
    await this.eventModel.deleteOne({ eventId });
  }

  async listForPayment(paymentId: string): Promise<PaymentEventRecord[]> {
    if (!OBJECT_ID.test(paymentId)) {
      return [];
    }

    const documents = await this.eventModel
      .find({ paymentId })
      .sort({ createdAt: -1, _id: -1 })
      .lean<AnyDocument[]>();

    return documents.map(toRecord);
  }

  async listForOrder(orderId: string): Promise<PaymentEventRecord[]> {
    if (!OBJECT_ID.test(orderId)) {
      return [];
    }

    const documents = await this.eventModel
      .find({ orderId })
      .sort({ createdAt: -1, _id: -1 })
      .lean<AnyDocument[]>();

    return documents.map(toRecord);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}

function toRecord(document: AnyDocument): PaymentEventRecord {
  return {
    id: String(document._id),
    eventId: String(document.eventId ?? ''),
    paymentId: document.paymentId ? String(document.paymentId) : null,
    orderId: document.orderId ? String(document.orderId) : null,
    orderNumber: document.orderNumber ? String(document.orderNumber) : null,
    type: String(document.type ?? ''),
    source: document.source ?? 'system',
    message: String(document.message ?? ''),
    gatewayReference: document.gatewayReference || undefined,
    payloadHash: document.payloadHash || undefined,
    receivedAt: document.createdAt ?? document.receivedAt ?? new Date(),
  };
}

/** Exported for the payments module factory (keeps ObjectId helpers in one file). */
export const toEventObjectId = (value: string): Types.ObjectId => new Types.ObjectId(value);
