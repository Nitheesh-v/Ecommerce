import { randomBytes } from 'node:crypto';
import { ReviewsRepository } from '../../src/modules/reviews/repositories/reviews.repository.js';
import type {
  CreateReviewInput,
  ModerationDecision,
  ReviewCountsRecord,
  ReviewListFilter,
  ReviewRecord,
} from '../../src/modules/reviews/repositories/reviews.repository.js';

/**
 * In-memory reviews repository.
 *
 * Mirrors the two guarantees `MongoReviewsRepository` gets from indexes and query
 * guards: a second review for the same (product, customer) returns `null`, and
 * `moderate()` refuses to set the status a row already has — so a double click or a
 * duplicated request cannot corrupt the console counts.
 */
export class InMemoryReviewsRepository implements ReviewsRepository {
  private readonly reviews = new Map<string, ReviewRecord>();

  /** Fixture helper: inserts a review directly, bypassing eligibility. */
  seed(overrides: Partial<ReviewRecord> & { productId: string; userId: string }) {
    const now = new Date();
    const review: ReviewRecord = {
      id: overrides.id ?? randomBytes(12).toString('hex'),
      productId: overrides.productId,
      userId: overrides.userId,
      customerName: overrides.customerName ?? 'Asha Rao',
      customerEmail: overrides.customerEmail ?? 'asha@example.com',
      orderId: overrides.orderId ?? randomBytes(12).toString('hex'),
      orderNumber: overrides.orderNumber ?? 'ORD-20261104-0001',
      rating: overrides.rating ?? 5,
      title: overrides.title ?? 'Great',
      comment: overrides.comment ?? 'Works exactly as described.',
      status: overrides.status ?? 'pending',
      moderatedBy: overrides.moderatedBy ?? null,
      moderatedAt: overrides.moderatedAt ?? null,
      moderationReason: overrides.moderationReason ?? null,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
    };

    this.reviews.set(review.id, review);

    return { ...review };
  }

  async create(input: CreateReviewInput): Promise<ReviewRecord | null> {
    if (this.findSync(input.productId, input.userId)) {
      return null;
    }

    const now = new Date();
    const review: ReviewRecord = {
      id: randomBytes(12).toString('hex'),
      ...input,
      status: 'pending',
      moderatedBy: null,
      moderatedAt: null,
      moderationReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.reviews.set(review.id, review);

    return { ...review };
  }

  async findById(id: string): Promise<ReviewRecord | null> {
    const review = this.reviews.get(id);

    return review ? { ...review } : null;
  }

  async findByProductAndUser(
    productId: string,
    userId: string,
  ): Promise<ReviewRecord | null> {
    const review = this.findSync(productId, userId);

    return review ? { ...review } : null;
  }

  async list(
    filter: ReviewListFilter,
  ): Promise<{ items: ReviewRecord[]; total: number }> {
    const search = filter.search?.toLowerCase();

    const matches = [...this.reviews.values()].filter((review) => {
      if (filter.approvedOnly && review.status !== 'approved') {
        return false;
      }
      if (!filter.approvedOnly && filter.status && review.status !== filter.status) {
        return false;
      }
      if (filter.productId && review.productId !== filter.productId) {
        return false;
      }
      if (filter.userId && review.userId !== filter.userId) {
        return false;
      }
      if (filter.rating && review.rating !== filter.rating) {
        return false;
      }
      if (filter.from && review.createdAt.getTime() < filter.from.getTime()) {
        return false;
      }
      if (filter.to && review.createdAt.getTime() > filter.to.getTime()) {
        return false;
      }
      if (search) {
        const haystack = [
          review.customerName,
          review.customerEmail,
          review.orderNumber,
          review.comment,
          review.title ?? '',
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });

    matches.sort((a, b) => {
      const direction = filter.sortOrder === 'asc' ? 1 : -1;

      switch (filter.sortBy) {
        case 'rating':
          return (a.rating - b.rating) * direction;
        case 'status':
          return a.status.localeCompare(b.status) * direction;
        default:
          return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
      }
    });

    const start = (filter.page - 1) * filter.limit;

    return {
      items: matches.slice(start, start + filter.limit).map((review) => ({ ...review })),
      total: matches.length,
    };
  }

  async counts(filter?: { productId?: string }): Promise<ReviewCountsRecord> {
    const scoped = [...this.reviews.values()].filter(
      (review) => !filter?.productId || review.productId === filter.productId,
    );
    const approved = scoped.filter((review) => review.status === 'approved');
    const distribution: ReviewCountsRecord['ratingDistribution'] = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    let sum = 0;

    for (const review of approved) {
      const key = String(review.rating) as '1' | '2' | '3' | '4' | '5';

      distribution[key] += 1;
      sum += review.rating;
    }

    return {
      total: scoped.length,
      pending: scoped.filter((review) => review.status === 'pending').length,
      approved: approved.length,
      rejected: scoped.filter((review) => review.status === 'rejected').length,
      averageRating:
        approved.length === 0 ? null : Math.round((sum / approved.length) * 10) / 10,
      ratingDistribution: distribution,
    };
  }

  async moderate(
    id: string,
    decision: ModerationDecision,
  ): Promise<ReviewRecord | null> {
    const review = this.reviews.get(id);

    if (!review || review.status === decision.status) {
      return null;
    }

    review.status = decision.status;
    review.moderatedBy = decision.by;
    review.moderatedAt = decision.at;
    review.moderationReason = decision.reason;
    review.updatedAt = decision.at;

    return { ...review };
  }

  async remove(id: string): Promise<boolean> {
    return this.reviews.delete(id);
  }

  reset(): void {
    this.reviews.clear();
  }

  all(): ReviewRecord[] {
    return [...this.reviews.values()].map((review) => ({ ...review }));
  }

  private findSync(productId: string, userId: string): ReviewRecord | null {
    return (
      [...this.reviews.values()].find(
        (review) => review.productId === productId && review.userId === userId,
      ) ?? null
    );
  }
}
