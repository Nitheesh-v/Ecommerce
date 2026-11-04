import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { getSkip } from '../../../common/utils/pagination.util.js';
import { escapeRegex } from '../../../common/utils/regex.util.js';
import {
  CouponCustomerUsage,
  Offer,
} from '../schemas/offer.schema.js';
import type { OfferLifecycleStatus } from '../schemas/offer.schema.js';
import { OffersRepository } from './offers.repository.js';
import type {
  CreateOfferInput,
  OfferCountsRecord,
  OfferListFilter,
  OfferRecord,
  OfferUpdate,
  PublicOfferRecord,
} from './offers.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DUPLICATE_KEY = 11_000;

@Injectable()
export class MongoOffersRepository implements OffersRepository {
  constructor(
    @InjectModel(Offer.name) private readonly offerModel: Model<Offer>,
    @InjectModel(CouponCustomerUsage.name)
    private readonly usageModel: Model<CouponCustomerUsage>,
  ) {}

  async create(input: CreateOfferInput): Promise<OfferRecord | null> {
    try {
      const document = await this.offerModel.create({
        ...input,
        code: input.code.toUpperCase(),
        applicableProductIds: input.applicableProductIds.map(toObjectId),
        applicableCategoryIds: input.applicableCategoryIds.map(toObjectId),
        excludedProductIds: input.excludedProductIds.map(toObjectId),
        excludedCategoryIds: input.excludedCategoryIds.map(toObjectId),
      });

      return toRecord(document.toObject() as AnyDocument);
    } catch (error) {
      // The unique code index is the authority: a duplicate is a 409, not a race.
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async findById(id: string): Promise<OfferRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const document = await this.offerModel.findById(id).lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async findByCode(code: string): Promise<OfferRecord | null> {
    const document = await this.offerModel
      .findOne({ code: code.trim().toUpperCase() })
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async list(
    filter: OfferListFilter,
  ): Promise<{ items: OfferRecord[]; total: number }> {
    const clauses: Record<string, unknown>[] = [];
    const statusClause = statusFilter(filter.status, filter.now);

    if (statusClause) {
      clauses.push(statusClause);
    }
    if (filter.type) {
      clauses.push({ type: filter.type });
    }
    if (filter.from) {
      // Overlap: the offer is still running at/after `from`.
      clauses.push({ endsAt: { $gte: filter.from } });
    }
    if (filter.to) {
      clauses.push({ startsAt: { $lte: filter.to } });
    }
    if (filter.search?.trim()) {
      const pattern = new RegExp(escapeRegex(filter.search.trim()), 'i');
      clauses.push({ $or: [{ name: pattern }, { code: pattern }] });
    }

    const query = clauses.length > 0 ? { $and: clauses } : {};
    const [documents, total] = await Promise.all([
      this.offerModel
        .find(query)
        .sort({ [filter.sortBy]: filter.sortOrder === 'asc' ? 1 : -1 })
        .skip(getSkip(filter.page, filter.limit))
        .limit(filter.limit)
        .lean<AnyDocument[]>(),
      this.offerModel.countDocuments(query),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async counts(now: Date): Promise<OfferCountsRecord> {
    const statuses: OfferLifecycleStatus[] = [
      'active',
      'scheduled',
      'expired',
      'exhausted',
      'inactive',
    ];
    const [total, ...counts] = await Promise.all([
      this.offerModel.countDocuments({}),
      ...statuses.map((status) =>
        this.offerModel.countDocuments(statusFilter(status, now) ?? {}),
      ),
    ]);
    const countOf = (status: OfferLifecycleStatus) =>
      counts[statuses.indexOf(status)] ?? 0;

    return {
      totalOffers: total,
      activeOffers: countOf('active'),
      scheduledOffers: countOf('scheduled'),
      expiredOffers: countOf('expired'),
      exhaustedOffers: countOf('exhausted'),
      inactiveOffers: countOf('inactive'),
    };
  }

  async update(id: string, update: OfferUpdate): Promise<OfferRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const set: Record<string, unknown> = {};
    const push: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) {
        continue;
      }
      if (key === 'history') {
        push.history = { $each: value };
        continue;
      }
      set[key] = value;
    }
    if (typeof set.code === 'string') {
      set.code = set.code.toUpperCase();
    }
    for (const key of [
      'applicableProductIds',
      'applicableCategoryIds',
      'excludedProductIds',
      'excludedCategoryIds',
    ]) {
      if (Array.isArray(set[key])) {
        set[key] = (set[key] as string[]).map(toObjectId);
      }
    }

    const operation: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) {
      operation.$set = set;
    }
    if (push.history) {
      operation.$push = push;
    }

    try {
      const document = await this.offerModel
        .findByIdAndUpdate(id, operation, { new: true })
        .lean<AnyDocument>();

      return document ? toRecord(document) : null;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Atomic claim of one use.
   *
   * Order of the two counters matters: the offer-wide counter is claimed first
   * (it is the stricter limit), then the per-customer counter. If the customer
   * counter refuses, the offer-wide claim is handed back, so a refused attempt
   * never consumes a use.
   */
  async reserveUsage(
    id: string,
    input: { customerKey: string; now: Date },
  ): Promise<boolean> {
    if (!OBJECT_ID.test(id)) {
      return false;
    }

    const now = input.now;
    const claimed = await this.offerModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isActive: true,
        startsAt: { $lte: now },
        endsAt: { $gte: now },
        $or: [
          { totalUsageLimit: null },
          { $expr: { $lt: ['$usageCount', '$totalUsageLimit'] } },
        ],
      },
      { $inc: { usageCount: 1 } },
      { new: true },
    );

    if (!claimed) {
      return false;
    }

    const limit = claimed.perCustomerLimit;
    const key = `${id}:${input.customerKey}`;
    const customerClaim = await this.usageModel.findOneAndUpdate(
      { key, count: { $lt: limit } },
      { $inc: { count: 1 } },
      { new: true },
    );

    if (customerClaim) {
      return true;
    }

    // No document exists yet → this is the customer's first use.
    try {
      await this.usageModel.create({
        key,
        offerId: new Types.ObjectId(id),
        customerKey: input.customerKey,
        count: 1,
      });

      return true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        await this.offerModel.updateOne(
          { _id: new Types.ObjectId(id) },
          { $inc: { usageCount: -1 } },
        );
        throw error;
      }
    }

    // The counter exists but is already at the limit: hand the use back.
    await this.offerModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { usageCount: -1 } },
    );

    return false;
  }

  async releaseUsage(id: string, customerKey: string): Promise<void> {
    if (!OBJECT_ID.test(id)) {
      return;
    }

    await Promise.all([
      this.offerModel.updateOne(
        { _id: new Types.ObjectId(id), usageCount: { $gt: 0 } },
        { $inc: { usageCount: -1 } },
      ),
      this.usageModel.updateOne(
        { key: `${id}:${customerKey}`, count: { $gt: 0 } },
        { $inc: { count: -1 } },
      ),
    ]);
  }

  async markRedeemed(id: string): Promise<void> {
    if (!OBJECT_ID.test(id)) {
      return;
    }

    await this.offerModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { redeemedCount: 1 } },
    );
  }

  async unmarkRedeemed(id: string): Promise<void> {
    if (!OBJECT_ID.test(id)) {
      return;
    }

    await this.offerModel.updateOne(
      { _id: new Types.ObjectId(id), redeemedCount: { $gt: 0 } },
      { $inc: { redeemedCount: -1 } },
    );
  }

  async customerUsage(id: string, customerKey: string): Promise<number> {
    if (!OBJECT_ID.test(id)) {
      return 0;
    }

    const document = await this.usageModel
      .findOne({ key: `${id}:${customerKey}` })
      .lean<{ count?: number } | null>();

    return document?.count ?? 0;
  }

  async listPublic(
    query: { search?: string; limit: number },
    now: Date,
  ): Promise<PublicOfferRecord[]> {
    const clauses: Record<string, unknown>[] = [
      {
        isActive: true,
        customerVisible: true,
        startsAt: { $lte: now },
        endsAt: { $gte: now },
        $or: [
          { totalUsageLimit: null },
          { $expr: { $lt: ['$usageCount', '$totalUsageLimit'] } },
        ],
      },
    ];

    if (query.search?.trim()) {
      const pattern = new RegExp(escapeRegex(query.search.trim()), 'i');
      clauses.push({
        $or: [{ name: pattern }, { code: pattern }, { description: pattern }],
      });
    }

    const documents = await this.offerModel
      .find({ $and: clauses })
      .sort({ endsAt: 1 })
      .limit(query.limit)
      .lean<AnyDocument[]>();

    return documents.map((document) => {
      const record = toRecord(document);

      return {
        id: record.id,
        name: record.name,
        description: record.description,
        code: record.code,
        type: record.type,
        value: record.value,
        minCartValue: record.minCartValue,
        maxDiscount: record.maxDiscount,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        applicableProductIds: record.applicableProductIds,
        applicableCategoryIds: record.applicableCategoryIds,
      };
    });
  }
}

/** Translates the derived status into stored predicates. */
export function statusFilter(
  status: OfferLifecycleStatus | undefined,
  now: Date,
): Record<string, unknown> | null {
  const running = { startsAt: { $lte: now }, endsAt: { $gte: now } };
  const notExhausted = {
    $or: [
      { totalUsageLimit: null },
      { $expr: { $lt: ['$usageCount', '$totalUsageLimit'] } },
    ],
  };

  switch (status) {
    case 'inactive':
      return { isActive: false };
    case 'scheduled':
      return { isActive: true, startsAt: { $gt: now } };
    case 'expired':
      return { isActive: true, startsAt: { $lte: now }, endsAt: { $lt: now } };
    case 'exhausted':
      return {
        isActive: true,
        ...running,
        totalUsageLimit: { $ne: null },
        $expr: { $gte: ['$usageCount', '$totalUsageLimit'] },
      };
    case 'active':
      return { isActive: true, ...running, ...notExhausted };
    default:
      return null;
  }
}

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}

function toIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function toRecord(document: AnyDocument): OfferRecord {
  return {
    id: String(document._id ?? document.id),
    name: document.name,
    description: document.description ?? undefined,
    code: document.code,
    type: document.type,
    value: document.value,
    minCartValue: document.minCartValue ?? 0,
    maxDiscount: document.maxDiscount ?? null,
    startsAt: new Date(document.startsAt),
    endsAt: new Date(document.endsAt),
    totalUsageLimit: document.totalUsageLimit ?? null,
    perCustomerLimit: document.perCustomerLimit ?? 1,
    applicableProductIds: toIdList(document.applicableProductIds),
    applicableCategoryIds: toIdList(document.applicableCategoryIds),
    excludedProductIds: toIdList(document.excludedProductIds),
    excludedCategoryIds: toIdList(document.excludedCategoryIds),
    customerVisible: document.customerVisible !== false,
    isActive: document.isActive !== false,
    usageCount: document.usageCount ?? 0,
    redeemedCount: document.redeemedCount ?? 0,
    createdBy: document.createdBy ?? null,
    updatedBy: document.updatedBy ?? null,
    history: (document.history ?? []).map((entry: AnyDocument) => ({
      action: entry.action,
      note: entry.note,
      by: entry.by ?? null,
      at: new Date(entry.at),
    })),
    createdAt: new Date(document.createdAt),
    updatedAt: new Date(document.updatedAt),
  };
}
