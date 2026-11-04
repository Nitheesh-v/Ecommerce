import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { getSkip } from '../../../common/utils/pagination.util.js';
import { escapeRegex } from '../../../common/utils/regex.util.js';
import { FAILED_DELIVERY_STATUSES } from '../shipment-status.js';
import { Shipment } from '../schemas/shipment.schema.js';
import type { ShipmentStatus } from '../schemas/shipment.schema.js';
import { ShipmentsRepository } from './shipments.repository.js';
import type {
  CreateShipmentInput,
  ShipmentEventRecord,
  ShipmentGuard,
  ShipmentListFilter,
  ShipmentRecord,
  ShipmentSummaryRecord,
  ShipmentUpdate,
} from './shipments.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DUPLICATE_KEY = 11_000;
/** Statuses where a promised date has passed but the parcel is still out there. */
const DELAYED_STATUSES: ShipmentStatus[] = [
  'pending',
  'ready_to_ship',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivery_failed',
];

@Injectable()
export class MongoShipmentsRepository implements ShipmentsRepository {
  constructor(
    @InjectModel(Shipment.name) private readonly shipmentModel: Model<Shipment>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async nextShipmentNumber(now = new Date()): Promise<string> {
    const db = this.getDb();
    const day = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('');

    // Same atomic-counter pattern as order numbers: one per day, `$inc` + upsert.
    const counter = (await db.collection('counters').findOneAndUpdate(
      { _id: `shipments-${day}` as unknown as Types.ObjectId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )) as unknown as { seq?: number } | null;

    return `SHP-${day}-${String(counter?.seq ?? 1).padStart(4, '0')}`;
  }

  async create(input: CreateShipmentInput): Promise<ShipmentRecord | null> {
    try {
      const document = await this.shipmentModel.create({
        ...input,
        orderId: new Types.ObjectId(input.orderId),
        events: [input.event],
      });

      return toRecord(document.toObject() as AnyDocument);
    } catch (error) {
      // The unique partial index on `orderId` refuses a second live shipment.
      if (isDuplicateKeyError(error)) {
        return null;
      }

      throw error;
    }
  }

  async findById(id: string): Promise<ShipmentRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const document = await this.shipmentModel
      .findById(new Types.ObjectId(id))
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async findLatestByOrderId(orderId: string): Promise<ShipmentRecord | null> {
    if (!OBJECT_ID.test(orderId)) {
      return null;
    }

    const document = await this.shipmentModel
      .findOne({ orderId: new Types.ObjectId(orderId) })
      .sort({ createdAt: -1 })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async findLiveByOrderId(orderId: string): Promise<ShipmentRecord | null> {
    if (!OBJECT_ID.test(orderId)) {
      return null;
    }

    const document = await this.shipmentModel
      .findOne({
        orderId: new Types.ObjectId(orderId),
        status: { $ne: 'returned_to_sender' },
      })
      .sort({ createdAt: -1 })
      .lean<AnyDocument | null>();

    return document ? toRecord(document) : null;
  }

  async liveOrderIds(orderIds: string[]): Promise<string[]> {
    const valid = orderIds.filter((id) => OBJECT_ID.test(id));

    if (valid.length === 0) {
      return [];
    }

    const documents = await this.shipmentModel
      .find({
        orderId: { $in: valid.map((id) => new Types.ObjectId(id)) },
        status: { $ne: 'returned_to_sender' },
      })
      .select({ orderId: 1 })
      .lean<Array<{ orderId: Types.ObjectId }>>();

    return documents.map((document) => String(document.orderId));
  }

  async list(
    filter: ShipmentListFilter,
  ): Promise<{ items: ShipmentRecord[]; total: number }> {
    const query: Record<string, unknown> = {};
    const now = filter.now ?? new Date();

    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.courier) {
      // Either the integration id or the printed partner name.
      const pattern = new RegExp(`^${escapeRegex(filter.courier.trim())}$`, 'i');
      query.$and = [{ $or: [{ 'courier.provider': pattern }, { 'courier.name': pattern }] }];
    }
    if (filter.from || filter.to) {
      query.createdAt = {
        ...(filter.from ? { $gte: filter.from } : {}),
        ...(filter.to ? { $lte: filter.to } : {}),
      };
    }
    if (filter.delayedOnly) {
      query.estimatedDelivery = { $lt: now };
      query.status = { $in: DELAYED_STATUSES };
    }

    const search = filter.search?.trim();

    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      const or: Record<string, unknown>[] = [
        { shipmentNumber: pattern },
        { orderNumber: pattern },
        { customerName: pattern },
        { customerEmail: pattern },
        { 'courier.trackingNumber': pattern },
        { 'courier.name': pattern },
      ];

      if (OBJECT_ID.test(search)) {
        or.push({ _id: new Types.ObjectId(search) });
      }

      const existing = query.$and as Record<string, unknown>[] | undefined;
      query.$and = [...(existing ?? []), { $or: or }];
    }

    const sort: Record<string, 1 | -1> = {
      [filter.sortBy]: filter.sortOrder === 'asc' ? 1 : -1,
      _id: filter.sortOrder === 'asc' ? 1 : -1,
    };

    const [documents, total] = await Promise.all([
      this.shipmentModel
        .find(query)
        .sort(sort)
        .skip(getSkip(filter.page, filter.limit))
        .limit(filter.limit)
        .lean<AnyDocument[]>(),
      this.shipmentModel.countDocuments(query),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async summary(now = new Date()): Promise<ShipmentSummaryRecord> {
    const [rows, delayed] = await Promise.all([
      this.shipmentModel.aggregate<{ _id: ShipmentStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.shipmentModel.countDocuments({
        estimatedDelivery: { $lt: now },
        status: { $in: DELAYED_STATUSES },
      }),
    ]);

    const count = (status: ShipmentStatus) =>
      rows.find((row) => row._id === status)?.count ?? 0;

    return {
      totalCount: rows.reduce((sum, row) => sum + row.count, 0),
      readyToShip: count('ready_to_ship') + count('pending'),
      shipped: count('shipped'),
      inTransit: count('in_transit'),
      outForDelivery: count('out_for_delivery'),
      delivered: count('delivered'),
      delayed,
      failed: FAILED_DELIVERY_STATUSES.reduce((sum, status) => sum + count(status), 0),
    };
  }

  async update(
    id: string,
    guard: ShipmentGuard,
    update: ShipmentUpdate,
    event?: ShipmentEventRecord,
  ): Promise<ShipmentRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const filter: Record<string, unknown> = { _id: new Types.ObjectId(id) };

    if (guard.status?.length) {
      filter.status = { $in: guard.status };
    }

    const set: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        set[key] = value;
      }
    }

    const mongoUpdate: Record<string, unknown> = {};

    if (Object.keys(set).length > 0) {
      mongoUpdate.$set = set;
    }
    if (event) {
      mongoUpdate.$push = { events: event };
    }
    if (Object.keys(mongoUpdate).length === 0) {
      return this.findById(id);
    }

    const document = await this.shipmentModel
      .findOneAndUpdate(filter, mongoUpdate, { returnDocument: 'after' })
      .lean<AnyDocument | null>();

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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}

function toRecord(document: AnyDocument): ShipmentRecord {
  return {
    id: String(document._id),
    shipmentNumber: String(document.shipmentNumber ?? ''),
    orderId: String(document.orderId),
    orderNumber: String(document.orderNumber ?? ''),
    userId: document.userId ? String(document.userId) : null,
    customerName: String(document.customerName ?? ''),
    customerEmail: String(document.customerEmail ?? ''),
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
    courier: {
      provider: String(document.courier?.provider ?? 'manual'),
      name: String(document.courier?.name ?? ''),
      trackingNumber: document.courier?.trackingNumber || undefined,
      trackingUrl: document.courier?.trackingUrl || undefined,
    },
    status: document.status ?? 'pending',
    shippingCost: Number(document.shippingCost ?? 0),
    weightGrams: document.weightGrams ?? undefined,
    dimensions: document.dimensions ?? undefined,
    notes: document.notes || undefined,
    estimatedDelivery: document.estimatedDelivery ?? undefined,
    shippedAt: document.shippedAt ?? undefined,
    actualDelivery: document.actualDelivery ?? undefined,
    failureReason: document.failureReason || undefined,
    createdBy: document.createdBy ?? null,
    updatedBy: document.updatedBy ?? null,
    events: (document.events ?? []).map((event: AnyDocument) => ({
      eventId: String(event.eventId ?? ''),
      type: event.type ?? 'status',
      from: event.from ?? undefined,
      to: event.to ?? undefined,
      note: event.note || undefined,
      reason: event.reason || undefined,
      source: event.source ?? 'admin',
      by: event.by ?? null,
      at: event.at ?? new Date(),
    })),
    createdAt: document.createdAt ?? new Date(),
    updatedAt: document.updatedAt ?? new Date(),
  };
}
