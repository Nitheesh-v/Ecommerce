import type { ReviewStatus } from '../schemas/review.schema.js';

/**
 * Reviews persistence contract.
 *
 * Kept as an abstract class so it doubles as the DI token (e2e tests swap in an
 * in-memory implementation, exactly like the orders/offers repositories).
 *
 * Two rules live here rather than in the service because they must survive
 * concurrency: a second review for the same (product, customer) returns `null`
 * instead of being written, and `moderate()` refuses to move a row to the status
 * it already has.
 */

export interface ReviewActor {
  userId?: string;
  email: string;
}

export interface ReviewRecord {
  id: string;
  productId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  orderId: string;
  orderNumber: string;
  rating: number;
  title: string | null;
  comment: string;
  status: ReviewStatus;
  moderatedBy: ReviewActor | null;
  moderatedAt: Date | null;
  moderationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReviewInput {
  productId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  orderId: string;
  orderNumber: string;
  rating: number;
  title: string | null;
  comment: string;
}

export type ReviewSortField = 'createdAt' | 'rating' | 'status';

export interface ReviewListFilter {
  page: number;
  limit: number;
  /** Matches customer name/email, order number or the comment body. */
  search?: string;
  status?: ReviewStatus;
  productId?: string;
  rating?: number;
  /** Inclusive created-at window. */
  from?: Date;
  to?: Date;
  /** Storefront reads: approved rows only. */
  approvedOnly?: boolean;
  /** Customer reads: their own rows only. */
  userId?: string;
  sortBy: ReviewSortField;
  sortOrder: 'asc' | 'desc';
}

export interface ReviewCountsRecord {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  /** Mean of approved ratings (1 decimal); `null` when nothing is approved. */
  averageRating: number | null;
  /** Approved reviews per star, `1`–`5`. */
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ModerationDecision {
  status: Exclude<ReviewStatus, 'pending'>;
  reason: string | null;
  by: ReviewActor;
  at: Date;
}

export abstract class ReviewsRepository {
  /** `null` when this customer already reviewed this product. */
  abstract create(input: CreateReviewInput): Promise<ReviewRecord | null>;

  abstract findById(id: string): Promise<ReviewRecord | null>;

  abstract findByProductAndUser(
    productId: string,
    userId: string,
  ): Promise<ReviewRecord | null>;

  abstract list(
    filter: ReviewListFilter,
  ): Promise<{ items: ReviewRecord[]; total: number }>;

  /** Counts + rating maths, optionally scoped to a single product. */
  abstract counts(filter?: { productId?: string }): Promise<ReviewCountsRecord>;

  /**
   * Moves a review to `approved`/`rejected`.
   *
   * `null` means the guard failed — either the row is gone or it already has that
   * status — so a double click cannot inflate the audit trail.
   */
  abstract moderate(
    id: string,
    decision: ModerationDecision,
  ): Promise<ReviewRecord | null>;

  /** Deletes a review outright; `false` when it was already gone. */
  abstract remove(id: string): Promise<boolean>;
}
