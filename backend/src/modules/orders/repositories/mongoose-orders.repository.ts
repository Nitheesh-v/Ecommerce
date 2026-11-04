import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import {
  OrdersRepository,
  type CreateOrderInput,
  type HistoryRecord,
  type OrderListFilter,
  type OrderRecord,
  type OrderUpdate,
  type RefundRecord,
  type ReturnRecord,
} from './orders.repository.js';
import type { OrderStatus, PaymentStatus } from '../schemas/order.schema.js';
import { Order } from '../schemas/order.schema.js';

/** Loose document shape for mapping (the model's types are far stricter). */
type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

@Injectable()
export class MongooseOrdersRepository implements OrdersRepository {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async nextOrderNumber(now = new Date()): Promise<string> {
    const db = this.getDb();
    const day = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('');

    // One counter per day; `$inc` with upsert is atomic, so two concurrent
    // checkouts can never receive the same sequence number.
    const counter = (await db.collection('counters').findOneAndUpdate(
      { _id: `orders-${day}` as unknown as Types.ObjectId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )) as unknown as { seq?: number } | null;

    const sequence = String(counter?.seq ?? 1).padStart(4, '0');

    return `ORD-${day}-${sequence}`;
  }

  async create(input: CreateOrderInput): Promise<OrderRecord | null> {
    try {
      const document = await this.orderModel.create(toDocumentInput(input));
      return toRecord(document.toObject() as AnyDocument);
    } catch (error) {
      // Duplicate idempotency key: the caller re-reads the existing order.
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async findById(id: string): Promise<OrderRecord | null> {
    if (!isObjectId(id)) {
      return null;
    }
    const document = await this.orderModel.findById(id).lean<AnyDocument>();
    return document ? toRecord(document) : null;
  }

  async findByIdempotencyKey(key: string): Promise<OrderRecord | null> {
    const document = await this.orderModel
      .findOne({ idempotencyKey: key })
      .lean<AnyDocument>();
    return document ? toRecord(document) : null;
  }

  async list(
    filter: OrderListFilter,
  ): Promise<{ items: OrderRecord[]; total: number }> {
    const query: Record<string, unknown> = {};

    if (filter.userId) {
      query.userId = toObjectId(filter.userId);
    }
    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.paymentStatus) {
      query.paymentStatus = filter.paymentStatus;
    }
    if (filter.paymentMethod) {
      query.paymentMethod = filter.paymentMethod;
    }
    if (filter.from || filter.to) {
      query.createdAt = {
        ...(filter.from ? { $gte: filter.from } : {}),
        ...(filter.to ? { $lte: filter.to } : {}),
      };
    }
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search), 'i');
      query.$or = [
        { orderNumber: rx },
        { customerName: rx },
        { customerEmail: rx },
        { 'shippingAddress.phone': rx },
      ];
    }

    const sort: Record<string, 1 | -1> = {
      [filter.sortBy]: filter.sortOrder === 'asc' ? 1 : -1,
    };

    const [documents, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort(sort)
        .skip((filter.page - 1) * filter.limit)
        .limit(filter.limit)
        .lean<AnyDocument[]>(),
      this.orderModel.countDocuments(query),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async apply(
    id: string,
    guard: { status?: OrderStatus[]; returnId?: string; paymentStatus?: PaymentStatus[] },
    update: OrderUpdate,
  ): Promise<OrderRecord | null> {
    if (!isObjectId(id)) {
      return null;
    }

    const filter: Record<string, unknown> = { _id: toObjectId(id) };

    if (guard.status?.length) {
      filter.status = { $in: guard.status };
    }
    if (guard.returnId) {
      filter['returns.returnId'] = guard.returnId;
    }
    if (guard.paymentStatus?.length) {
      // Guards gateway/webhook writes: two concurrent captures cannot both land.
      filter.paymentStatus = { $in: guard.paymentStatus };
    }

    const mongoUpdate: Record<string, unknown> = {};
    if (update.set && Object.keys(update.set).length > 0) {
      mongoUpdate.$set = toSetDocument(update.set);
    }
    if (update.pushHistory?.length) {
      mongoUpdate.$push = {
        ...(mongoUpdate.$push as Record<string, unknown> | undefined),
        history: { $each: update.pushHistory.map(toHistoryDocument) },
      };
    }
    if (update.pushReturn) {
      mongoUpdate.$push = {
        ...(mongoUpdate.$push as Record<string, unknown> | undefined),
        returns: toReturnDocument(update.pushReturn),
      };
    }

    const document = await this.orderModel
      .findOneAndUpdate(filter, mongoUpdate, { returnDocument: 'after' })
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  private getDb() {
    const db = this.connection.db;
    if (!db) {
      throw new ServiceUnavailableException('Database connection is not ready');
    }
    return db;
  }
}

function toDocumentInput(input: CreateOrderInput) {
  return {
    ...input,
    userId: input.userId ? toObjectId(input.userId) : null,
    // Denormalised so list filters and the dashboard can query it directly.
    paymentMethod: input.payment.method,
    items: input.items.map((item) => ({
      ...item,
      imageUrl: item.imageUrl ?? null,
      productId: toObjectId(item.productId),
    })),
    history: input.history.map(toHistoryDocument),
  };
}

function toSetDocument(set: Record<string, unknown>): Record<string, unknown> {
  const document: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) {
      continue;
    }

    if (key === 'returns') {
      document.returns = (value as ReturnRecord[]).map(toReturnDocument);

      continue;
    }

    if (key === 'payment') {
      const payment = value as OrderRecord['payment'];
      document.payment = {
        ...payment,
        refunds: payment.refunds.map(toRefundDocument),
      };

      continue;
    }

    if (key === 'shipping') {
      document.shipping = value;

      continue;
    }

    if (key === 'cancellation') {
      const cancellation = value as OrderRecord['cancellation'];
      document.cancellation = cancellation
        ? {
            ...cancellation,
            cancelledBy: cancellation.cancelledBy ?? null,
          }
        : null;

      continue;
    }

    document[key] = value;
  }

  return document;
}

function toHistoryDocument(entry: HistoryRecord) {
  return {
    kind: entry.kind,
    from: entry.from,
    to: entry.to,
    reason: entry.reason,
    note: entry.note,
    by: entry.by ?? null,
    at: entry.at,
  };
}

function toReturnDocument(entry: ReturnRecord) {
  return {
    ...entry,
    items: entry.items.map((item) => ({
      ...item,
      productId: toObjectId(item.productId),
    })),
    requestedBy: entry.requestedBy ?? null,
    decidedBy: entry.decidedBy ?? null,
  };
}

function toRefundDocument(refund: RefundRecord) {
  return {
    ...refund,
    requestedBy: refund.requestedBy ?? null,
    processedBy: refund.processedBy ?? null,
  };
}

function toRecord(document: AnyDocument): OrderRecord {
  const shipping = document.shipping;
  const payment = document.payment ?? {};

  return {
    id: String(document._id),
    orderNumber: String(document.orderNumber ?? ''),
    userId: document.userId ? String(document.userId) : null,
    customerName: String(document.customerName ?? ''),
    customerEmail: String(document.customerEmail ?? ''),
    customerPhone: document.customerPhone || undefined,
    items: (document.items ?? []).map((item: AnyDocument) => ({
      productId: String(item.productId),
      name: String(item.name ?? ''),
      sku: String(item.sku ?? ''),
      imageUrl: item.imageUrl ?? null,
      unitPrice: Number(item.unitPrice ?? 0),
      listPrice: Number(item.listPrice ?? item.unitPrice ?? 0),
      discount: Number(item.discount ?? 0),
      quantity: Number(item.quantity ?? 0),
      lineTotal: Number(item.lineTotal ?? 0),
    })),
    subtotal: Number(document.subtotal ?? 0),
    discountTotal: Number(document.discountTotal ?? 0),
    couponCode: document.couponCode || undefined,
    couponDiscount: Number(document.couponDiscount ?? 0),
    shippingCharge: Number(document.shippingCharge ?? 0),
    taxAmount: Number(document.taxAmount ?? 0),
    taxRatePercent: Number(document.taxRatePercent ?? 0),
    total: Number(document.total ?? 0),
    currency: String(document.currency ?? 'INR'),
    shippingAddress: {
      recipientName: String(document.shippingAddress?.recipientName ?? ''),
      phone: String(document.shippingAddress?.phone ?? ''),
      line1: String(document.shippingAddress?.line1 ?? ''),
      line2: document.shippingAddress?.line2 || undefined,
      city: String(document.shippingAddress?.city ?? ''),
      state: String(document.shippingAddress?.state ?? ''),
      postalCode: String(document.shippingAddress?.postalCode ?? ''),
      country: String(document.shippingAddress?.country ?? 'India'),
    },
    shippingMethod: document.shippingMethod ?? 'standard',
    shipping: shipping
      ? {
          provider: shipping.provider || undefined,
          trackingNumber: shipping.trackingNumber || undefined,
          trackingUrl: shipping.trackingUrl || undefined,
          shippedAt: toDate(shipping.shippedAt),
          estimatedDelivery: toDate(shipping.estimatedDelivery),
          deliveredAt: toDate(shipping.deliveredAt),
          notes: (shipping.notes ?? []).map((note: AnyDocument) => ({
            note: String(note.note ?? ''),
            at: toDate(note.at) ?? new Date(0),
            by: note.by || undefined,
          })),
        }
      : undefined,
    payment: {
      method: payment.method ?? document.paymentMethod ?? 'manual',
      transactionId: payment.transactionId || undefined,
      paidAmount: Number(payment.paidAmount ?? 0),
      paidAt: toDate(payment.paidAt),
      refunds: (payment.refunds ?? []).map((refund: AnyDocument) => ({
        refundId: String(refund.refundId ?? ''),
        amount: Number(refund.amount ?? 0),
        status: refund.status ?? 'pending',
        reason: String(refund.reason ?? ''),
        reference: refund.reference || undefined,
        requestedAt: toDate(refund.requestedAt) ?? new Date(0),
        requestedBy: refund.requestedBy ?? null,
        processedAt: toDate(refund.processedAt),
        processedBy: refund.processedBy ?? null,
        note: refund.note || undefined,
      })),
    },
    paymentMethod: document.paymentMethod ?? 'manual',
    paymentStatus: document.paymentStatus ?? 'pending',
    status: document.status ?? 'pending',
    cancellation: document.cancellation
      ? {
          reason: String(document.cancellation.reason ?? ''),
          note: document.cancellation.note || undefined,
          cancelledAt: toDate(document.cancellation.cancelledAt) ?? new Date(0),
          cancelledBy: document.cancellation.cancelledBy ?? null,
          restocked: Boolean(document.cancellation.restocked),
          restockedAt: toDate(document.cancellation.restockedAt),
        }
      : undefined,
    returns: (document.returns ?? []).map((entry: AnyDocument) => ({
      returnId: String(entry.returnId ?? ''),
      status: entry.status ?? 'requested',
      reason: String(entry.reason ?? ''),
      note: entry.note || undefined,
      items: (entry.items ?? []).map((item: AnyDocument) => ({
        productId: String(item.productId),
        name: String(item.name ?? ''),
        sku: String(item.sku ?? ''),
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
      })),
      refundableAmount: Number(entry.refundableAmount ?? 0),
      inspectionNotes: entry.inspectionNotes || undefined,
      inspectionPassed:
        entry.inspectionPassed === undefined ? undefined : Boolean(entry.inspectionPassed),
      restockApproved: Boolean(entry.restockApproved),
      restockedAt: toDate(entry.restockedAt),
      refundId: entry.refundId || undefined,
      requestedAt: toDate(entry.requestedAt) ?? new Date(0),
      requestedBy: entry.requestedBy ?? null,
      decidedAt: toDate(entry.decidedAt),
      decidedBy: entry.decidedBy ?? null,
      decisionNote: entry.decisionNote || undefined,
    })),
    history: (document.history ?? []).map((entry: AnyDocument) => ({
      kind: entry.kind ?? 'note',
      from: entry.from || undefined,
      to: entry.to || undefined,
      reason: entry.reason || undefined,
      note: entry.note || undefined,
      by: entry.by ?? null,
      at: toDate(entry.at) ?? new Date(0),
    })),
    idempotencyKey: document.idempotencyKey || undefined,
    closedAt: toDate(document.closedAt) ?? null,
    createdAt: toDate(document.createdAt) ?? new Date(0),
    updatedAt: toDate(document.updatedAt) ?? new Date(0),
  };
}

function toDate(value: unknown): Date | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value : new Date(String(value));
}

function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}
