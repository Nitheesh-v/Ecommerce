import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { escapeRegex } from '../../../common/utils/regex.util.js';
import { getSkip } from '../../../common/utils/pagination.util.js';
import { Payment } from '../schemas/payment.schema.js';
import type { PaymentStatus } from '../schemas/payment.schema.js';
import { OPEN_PAYMENT_STATUSES, SETTLED_PAYMENT_STATUSES } from '../payment-status.js';
import { PaymentsRepository } from './payments.repository.js';
import type {
  CreatePaymentInput,
  PaymentGuard,
  PaymentListFilter,
  PaymentRecord,
  PaymentSummaryRecord,
  PaymentUpdate,
} from './payments.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OBJECT_ID = /^[0-9a-f]{24}$/i;

@Injectable()
export class MongoPaymentsRepository implements PaymentsRepository {
  constructor(@InjectModel(Payment.name) private readonly paymentModel: Model<Payment>) {}

  async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    const document = await this.paymentModel.create({
      ...input,
      orderId: new Types.ObjectId(input.orderId),
      gatewayOrderId: undefined,
      gatewayPaymentId: undefined,
    });

    return toRecord(document.toObject() as AnyDocument);
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const document = await this.paymentModel
      .findById(new Types.ObjectId(id))
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async findByGatewayOrderId(gatewayOrderId: string): Promise<PaymentRecord | null> {
    const document = await this.paymentModel
      .findOne({ gatewayOrderId })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async findByGatewayPaymentId(gatewayPaymentId: string): Promise<PaymentRecord | null> {
    const document = await this.paymentModel
      .findOne({ gatewayPaymentId })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async findOpenForOrder(orderId: string): Promise<PaymentRecord | null> {
    if (!OBJECT_ID.test(orderId)) {
      return null;
    }

    const document = await this.paymentModel
      .findOne({
        orderId: new Types.ObjectId(orderId),
        status: { $in: OPEN_PAYMENT_STATUSES },
      })
      .sort({ createdAt: -1 })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async findSettledForOrder(orderId: string): Promise<PaymentRecord | null> {
    if (!OBJECT_ID.test(orderId)) {
      return null;
    }

    const document = await this.paymentModel
      .findOne({
        orderId: new Types.ObjectId(orderId),
        status: { $in: SETTLED_PAYMENT_STATUSES },
      })
      .sort({ createdAt: -1 })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async list(
    filter: PaymentListFilter,
  ): Promise<{ items: PaymentRecord[]; total: number }> {
    const query: Record<string, unknown> = {};

    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.method) {
      query.method = filter.method;
    }
    if (filter.from || filter.to) {
      query.createdAt = {
        ...(filter.from ? { $gte: filter.from } : {}),
        ...(filter.to ? { $lte: filter.to } : {}),
      };
    }

    const search = filter.search?.trim();

    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      const or: Record<string, unknown>[] = [
        { orderNumber: pattern },
        { customerName: pattern },
        { customerEmail: pattern },
        { gatewayOrderId: pattern },
        { gatewayPaymentId: pattern },
      ];

      if (OBJECT_ID.test(search)) {
        or.push({ _id: new Types.ObjectId(search) });
      }

      query.$or = or;
    }

    const sort: Record<string, 1 | -1> = {
      [filter.sortBy]: filter.sortOrder === 'asc' ? 1 : -1,
      _id: filter.sortOrder === 'asc' ? 1 : -1,
    };

    const [documents, total] = await Promise.all([
      this.paymentModel
        .find(query)
        .sort(sort)
        .skip(getSkip(filter.page, filter.limit))
        .limit(filter.limit)
        .lean<AnyDocument[]>(),
      this.paymentModel.countDocuments(query),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async summary(): Promise<PaymentSummaryRecord> {
    const [row] = await this.paymentModel.aggregate<{
      totalCount: number;
      totalAmount: number;
      successfulCount: number;
      successfulAmount: number;
      pendingCount: number;
      pendingAmount: number;
      failedCount: number;
      failedAmount: number;
      refundedAmount: number;
    }>([
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulCount: {
            $sum: { $cond: [{ $in: ['$status', SETTLED_PAYMENT_STATUSES] }, 1, 0] },
          },
          successfulAmount: {
            $sum: {
              $cond: [{ $in: ['$status', SETTLED_PAYMENT_STATUSES] }, '$amount', 0],
            },
          },
          pendingCount: {
            $sum: { $cond: [{ $in: ['$status', OPEN_PAYMENT_STATUSES] }, 1, 0] },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $in: ['$status', OPEN_PAYMENT_STATUSES] }, '$amount', 0],
            },
          },
          failedCount: {
            $sum: {
              $cond: [{ $in: ['$status', ['failed', 'cancelled']] }, 1, 0],
            },
          },
          failedAmount: {
            $sum: {
              $cond: [{ $in: ['$status', ['failed', 'cancelled']] }, '$amount', 0],
            },
          },
          refundedAmount: { $sum: { $ifNull: ['$refundedAmount', 0] } },
        },
      },
      { $project: { _id: 0 } },
    ]);

    return {
      totalCount: row?.totalCount ?? 0,
      totalAmount: row?.totalAmount ?? 0,
      successfulCount: row?.successfulCount ?? 0,
      successfulAmount: row?.successfulAmount ?? 0,
      pendingCount: row?.pendingCount ?? 0,
      pendingAmount: row?.pendingAmount ?? 0,
      failedCount: row?.failedCount ?? 0,
      failedAmount: row?.failedAmount ?? 0,
      refundedAmount: row?.refundedAmount ?? 0,
      currency: 'INR',
    };
  }

  async update(
    id: string,
    guard: PaymentGuard,
    update: PaymentUpdate,
  ): Promise<PaymentRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const filter: Record<string, unknown> = { _id: new Types.ObjectId(id) };

    if (guard.status?.length) {
      filter.status = { $in: guard.status satisfies PaymentStatus[] };
    }

    const set: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        set[key] = value;
      }
    }

    if (Object.keys(set).length === 0) {
      return this.findById(id);
    }

    const document = await this.paymentModel
      .findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }
}

function toRecord(document: AnyDocument): PaymentRecord {
  return {
    id: String(document._id),
    orderId: String(document.orderId),
    orderNumber: String(document.orderNumber ?? ''),
    userId: document.userId ? String(document.userId) : null,
    customerEmail: String(document.customerEmail ?? ''),
    customerName: String(document.customerName ?? ''),
    amount: Number(document.amount ?? 0),
    currency: String(document.currency ?? 'INR'),
    provider: document.provider ?? 'razorpay',
    method: document.method ?? 'manual',
    status: document.status ?? 'pending',
    gatewayStatus: document.gatewayStatus || undefined,
    gatewayOrderId: document.gatewayOrderId || undefined,
    gatewayPaymentId: document.gatewayPaymentId || undefined,
    signatureVerified: Boolean(document.signatureVerified),
    verifiedWithGateway: Boolean(document.verifiedWithGateway),
    failureReason: document.failureReason || undefined,
    capturedAt: document.capturedAt ?? undefined,
    failedAt: document.failedAt ?? undefined,
    cancelledAt: document.cancelledAt ?? undefined,
    refundedAmount: Number(document.refundedAmount ?? 0),
    pendingRefundAmount: Number(document.pendingRefundAmount ?? 0),
    latestEvent: document.latestEvent || undefined,
    lastEventAt: document.lastEventAt ?? undefined,
    createdAt: document.createdAt ?? new Date(),
    updatedAt: document.updatedAt ?? new Date(),
  };
}
