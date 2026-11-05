import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { getSkip } from '../../../common/utils/pagination.util.js';
import { escapeRegex } from '../../../common/utils/regex.util.js';
import { Review } from '../schemas/review.schema.js';
import { ReviewsRepository } from './reviews.repository.js';
import type {
  CreateReviewInput,
  ModerationDecision,
  ReviewCountsRecord,
  ReviewListFilter,
  ReviewRecord,
} from './reviews.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DUPLICATE_KEY = 11_000;

/**
 * Mongo persistence for reviews.
 *
 * The two guards that matter live in the queries, not in the service:
 * the unique `(productId, userId)` index turns a double submit into a `null`
 * (→ 409), and `moderate()` updates with a `status: { $ne: … }` predicate so a
 * repeated click cannot rewrite the same decision.
 */
@Injectable()
export class MongoReviewsRepository implements ReviewsRepository {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
  ) {}

  async create(input: CreateReviewInput): Promise<ReviewRecord | null> {
    try {
      const document = await this.reviewModel.create({
        ...input,
        productId: toObjectId(input.productId),
        userId: toObjectId(input.userId),
        orderId: toObjectId(input.orderId),
        status: 'pending',
        moderatedBy: null,
        moderatedAt: null,
        moderationReason: null,
      });

      return toRecord(document.toObject() as AnyDocument);
    } catch (error) {
      // One review per customer per product — the index is the authority.
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async findById(id: string): Promise<ReviewRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const document = await this.reviewModel.findById(id).lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async findByProductAndUser(
    productId: string,
    userId: string,
  ): Promise<ReviewRecord | null> {
    if (!OBJECT_ID.test(productId) || !OBJECT_ID.test(userId)) {
      return null;
    }

    const document = await this.reviewModel
      .findOne({ productId: toObjectId(productId), userId: toObjectId(userId) })
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async list(
    filter: ReviewListFilter,
  ): Promise<{ items: ReviewRecord[]; total: number }> {
    const match = buildMatch(filter);
    const direction = filter.sortOrder === 'asc' ? 1 : -1;
    // Newest first breaks ties, so pagination stays stable.
    const sort: Record<string, 1 | -1> =
      filter.sortBy === 'createdAt'
        ? { createdAt: direction }
        : { [filter.sortBy]: direction, createdAt: -1 };

    const [documents, total] = await Promise.all([
      this.reviewModel
        .find(match)
        .sort(sort)
        .skip(getSkip(filter.page, filter.limit))
        .limit(filter.limit)
        .lean<AnyDocument[]>(),
      this.reviewModel.countDocuments(match),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async counts(filter?: { productId?: string }): Promise<ReviewCountsRecord> {
    const match: Record<string, unknown> = {};

    if (filter?.productId) {
      if (!OBJECT_ID.test(filter.productId)) {
        return emptyCounts();
      }
      match.productId = toObjectId(filter.productId);
    }

    const [rows] = await this.reviewModel.aggregate<{
      statuses: Array<{ _id: string; count: number }>;
      ratings: Array<{ _id: number; count: number }>;
    }>([
      { $match: match },
      {
        $facet: {
          statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          ratings: [
            { $match: { status: 'approved' } },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    return toCounts(rows?.statuses ?? [], rows?.ratings ?? []);
  }

  async moderate(
    id: string,
    decision: ModerationDecision,
  ): Promise<ReviewRecord | null> {
    if (!OBJECT_ID.test(id)) {
      return null;
    }

    const document = await this.reviewModel
      .findOneAndUpdate(
        { _id: toObjectId(id), status: { $ne: decision.status } },
        {
          status: decision.status,
          moderatedBy: {
            userId: decision.by.userId ?? null,
            email: decision.by.email,
          },
          moderatedAt: decision.at,
          moderationReason: decision.reason,
        },
        { new: true },
      )
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async remove(id: string): Promise<boolean> {
    if (!OBJECT_ID.test(id)) {
      return false;
    }

    const result = await this.reviewModel.deleteOne({ _id: toObjectId(id) });

    return result.deletedCount > 0;
  }
}

/** Shared predicate builder for the list and (via `counts`) the console. */
export function buildMatch(filter: ReviewListFilter): Record<string, unknown> {
  const match: Record<string, unknown> = {};

  if (filter.approvedOnly) {
    match.status = 'approved';
  } else if (filter.status) {
    match.status = filter.status;
  }

  if (filter.productId) {
    match.productId = OBJECT_ID.test(filter.productId)
      ? toObjectId(filter.productId)
      : new Types.ObjectId('000000000000000000000000');
  }

  if (filter.userId) {
    match.userId = OBJECT_ID.test(filter.userId)
      ? toObjectId(filter.userId)
      : new Types.ObjectId('000000000000000000000000');
  }

  if (filter.rating) {
    match.rating = filter.rating;
  }

  if (filter.from || filter.to) {
    match.createdAt = {
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lte: filter.to } : {}),
    };
  }

  if (filter.search) {
    const pattern = new RegExp(escapeRegex(filter.search.trim()), 'i');

    match.$or = [
      { customerName: pattern },
      { customerEmail: pattern },
      { orderNumber: pattern },
      { comment: pattern },
      { title: pattern },
    ];
  }

  return match;
}

export function emptyCounts(): ReviewCountsRecord {
  return {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    averageRating: null,
    ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  };
}

function toCounts(
  statuses: Array<{ _id: string; count: number }>,
  ratings: Array<{ _id: number; count: number }>,
): ReviewCountsRecord {
  const counts = emptyCounts();

  for (const entry of statuses) {
    counts.total += entry.count;

    if (entry._id === 'pending') counts.pending = entry.count;
    if (entry._id === 'approved') counts.approved = entry.count;
    if (entry._id === 'rejected') counts.rejected = entry.count;
  }

  let sum = 0;
  let rated = 0;

  for (const entry of ratings) {
    const key = String(entry._id) as '1' | '2' | '3' | '4' | '5';

    if (key in counts.ratingDistribution) {
      counts.ratingDistribution[key] = entry.count;
    }
    sum += entry._id * entry.count;
    rated += entry.count;
  }

  counts.averageRating = rated === 0 ? null : Math.round((sum / rated) * 10) / 10;

  return counts;
}

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}

function toRecord(document: AnyDocument): ReviewRecord {
  return {
    id: String(document._id ?? document.id),
    productId: String(document.productId),
    userId: String(document.userId),
    customerName: document.customerName,
    customerEmail: document.customerEmail,
    orderId: String(document.orderId),
    orderNumber: document.orderNumber,
    rating: document.rating,
    title: document.title ?? null,
    comment: document.comment,
    status: document.status,
    moderatedBy: document.moderatedBy
      ? {
          userId: document.moderatedBy.userId ?? undefined,
          email: document.moderatedBy.email,
        }
      : null,
    moderatedAt: document.moderatedAt ? new Date(document.moderatedAt) : null,
    moderationReason: document.moderationReason ?? null,
    createdAt: new Date(document.createdAt),
    updatedAt: new Date(document.updatedAt),
  };
}
