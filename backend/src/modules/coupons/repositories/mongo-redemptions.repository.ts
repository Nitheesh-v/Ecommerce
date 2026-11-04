import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { getSkip } from '../../../common/utils/pagination.util.js';
import { escapeRegex } from '../../../common/utils/regex.util.js';
import { CouponRedemption } from '../schemas/offer.schema.js';
import type { RedemptionStatus } from '../schemas/offer.schema.js';
import { RedemptionsRepository } from './offers.repository.js';
import type {
  CreateRedemptionInput,
  RedemptionListFilter,
  RedemptionRecord,
  RedemptionSummaryRecord,
} from './offers.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DUPLICATE_KEY = 11_000;

@Injectable()
export class MongoRedemptionsRepository implements RedemptionsRepository {
  constructor(
    @InjectModel(CouponRedemption.name)
    private readonly redemptionModel: Model<CouponRedemption>,
  ) {}

  async create(input: CreateRedemptionInput): Promise<RedemptionRecord | null> {
    try {
      const document = await this.redemptionModel.create({
        ...input,
        offerId: new Types.ObjectId(input.offerId),
        customerEmail: input.customerEmail.toLowerCase(),
      });

      return toRecord(document.toObject() as AnyDocument);
    } catch (error) {
      // Same (offer, order) pair, or a replayed redemption id: not a new use.
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async findById(redemptionId: string): Promise<RedemptionRecord | null> {
    const document = await this.redemptionModel
      .findOne({ redemptionId })
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async attachOrder(
    redemptionId: string,
    order: { orderId: string; orderNumber: string },
  ): Promise<void> {
    await this.redemptionModel.updateOne(
      { redemptionId, orderId: null },
      {
        $set: {
          orderId: new Types.ObjectId(order.orderId),
          orderNumber: order.orderNumber,
        },
      },
    );
  }

  /** reserved → redeemed, guarded so a replay cannot count twice. */
  async confirm(redemptionId: string, at: Date): Promise<boolean> {
    const result = await this.redemptionModel.updateOne(
      { redemptionId, status: 'reserved' },
      { $set: { status: 'redeemed', redeemedAt: at } },
    );

    return result.modifiedCount === 1;
  }

  async reverse(
    redemptionId: string,
    input: { at: Date; reason: string },
  ): Promise<RedemptionStatus | null> {
    const document = await this.redemptionModel
      .findOneAndUpdate(
        { redemptionId, status: { $in: ['reserved', 'redeemed'] } },
        {
          $set: {
            status: 'reversed',
            reversedAt: input.at,
            reversalReason: input.reason,
          },
        },
        { new: false },
      )
      .lean<AnyDocument>();

    return (document?.status as RedemptionStatus) ?? null;
  }

  async findByOrderId(orderId: string): Promise<RedemptionRecord | null> {
    if (!OBJECT_ID.test(orderId)) {
      return null;
    }

    const document = await this.redemptionModel
      .findOne({ orderId: new Types.ObjectId(orderId) })
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async list(
    filter: RedemptionListFilter,
  ): Promise<{ items: RedemptionRecord[]; total: number }> {
    const clauses: Record<string, unknown>[] = [];

    if (filter.status) {
      clauses.push({ status: filter.status });
    }
    if (filter.offerId && OBJECT_ID.test(filter.offerId)) {
      clauses.push({ offerId: new Types.ObjectId(filter.offerId) });
    }
    if (filter.from || filter.to) {
      clauses.push({
        reservedAt: {
          ...(filter.from ? { $gte: filter.from } : {}),
          ...(filter.to ? { $lte: filter.to } : {}),
        },
      });
    }
    if (filter.search?.trim()) {
      const pattern = new RegExp(escapeRegex(filter.search.trim()), 'i');
      clauses.push({
        $or: [
          { code: pattern },
          { orderNumber: pattern },
          { customerEmail: pattern },
        ],
      });
    }

    const query = clauses.length > 0 ? { $and: clauses } : {};
    const [documents, total] = await Promise.all([
      this.redemptionModel
        .find(query)
        .sort({ [filter.sortBy]: filter.sortOrder === 'asc' ? 1 : -1 })
        .skip(getSkip(filter.page, filter.limit))
        .limit(filter.limit)
        .lean<AnyDocument[]>(),
      this.redemptionModel.countDocuments(query),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async summary(offerId?: string): Promise<RedemptionSummaryRecord> {
    const match: Record<string, unknown> = { status: 'redeemed' };

    if (offerId && OBJECT_ID.test(offerId)) {
      match.offerId = new Types.ObjectId(offerId);
    }

    const [aggregate] = await this.redemptionModel.aggregate<{
      count: number;
      discount: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          discount: { $sum: '$discountAmount' },
        },
      },
    ]);

    return {
      totalRedemptions: aggregate?.count ?? 0,
      totalDiscountGiven: aggregate?.discount ?? 0,
    };
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}

function toRecord(document: AnyDocument): RedemptionRecord {
  return {
    redemptionId: document.redemptionId,
    offerId: String(document.offerId),
    code: document.code,
    type: document.type,
    value: document.value,
    orderId: document.orderId ? String(document.orderId) : null,
    orderNumber: document.orderNumber ?? null,
    userId: document.userId ?? null,
    customerEmail: document.customerEmail,
    discountAmount: document.discountAmount ?? 0,
    freeShipping: document.freeShipping === true,
    status: document.status,
    reservedAt: new Date(document.reservedAt),
    redeemedAt: document.redeemedAt ? new Date(document.redeemedAt) : null,
    reversedAt: document.reversedAt ? new Date(document.reversedAt) : null,
    reversalReason: document.reversalReason ?? null,
  };
}
