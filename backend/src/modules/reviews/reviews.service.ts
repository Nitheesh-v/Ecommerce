import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import { OrdersRepository } from '../orders/repositories/orders.repository.js';
import { ProductsService } from '../products/products.service.js';
import type { CreateReviewDto, ModerateReviewDto } from './dto/create-review.dto.js';
import type {
  MyReviewsQueryDto,
  ProductReviewsQueryDto,
  ReviewsQueryDto,
} from './dto/reviews-query.dto.js';
import { ReviewsRepository } from './repositories/reviews.repository.js';
import type { ReviewRecord } from './repositories/reviews.repository.js';
import { REVIEW_STATUS_LABELS } from './schemas/review.schema.js';
import type { ReviewStatus } from './schemas/review.schema.js';

/** Admin / customer view of one review. */
export interface ReviewView {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  customerName: string;
  customerEmail: string;
  rating: number;
  ratingLabel: string;
  title: string | null;
  comment: string;
  status: ReviewStatus;
  statusLabel: string;
  /** Always `true` today — reviews are only accepted from delivered orders. */
  verifiedPurchase: boolean;
  orderId: string;
  orderNumber: string;
  moderatedBy: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What a shopper sees: no email, no order, no moderation metadata. */
export interface PublicReviewView {
  id: string;
  rating: number;
  ratingLabel: string;
  title: string | null;
  comment: string;
  author: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface ProductRatingView {
  productId: string;
  reviewCount: number;
  averageRating: number | null;
  distribution: Array<{ stars: number; count: number; percent: number }>;
}

export interface ReviewSummaryView {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  averageRating: number | null;
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** Tells the product page which state its "write a review" button is in. */
export interface ReviewEligibilityView {
  canReview: boolean;
  reason: string | null;
  existingReviewId: string | null;
  existingReviewStatus: ReviewStatus | null;
  orderNumber: string | null;
}

const MAX_DELIVERED_ORDERS_SCANNED = 100;

/**
 * Reviews & ratings.
 *
 * Three rules shape this service:
 *
 * 1. **Verified buyers only.** A review needs a `delivered` order from the same
 *    customer that contains the product; the order id is stored with the review so
 *    the claim can always be re-checked.
 * 2. **Nothing publishes itself.** Rows start `pending`; only
 *    `PATCH /api/admin/reviews/:id` can approve or reject them, and the storefront
 *    reads approved rows only.
 * 3. **One review per customer per product**, enforced by a unique index. A second
 *    submit is a `409`, never a silent overwrite — editing is a moderation concern,
 *    not something the customer can use to game the average.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly productsService: ProductsService,
    private readonly orders: OrdersRepository,
  ) {}

  /* ---------------------------------------------------------------- customer */

  async eligibility(
    idOrSlug: string,
    user: AuthenticatedUser,
  ): Promise<ReviewEligibilityView> {
    const product = await this.productsService.getPublic(idOrSlug);
    const existing = await this.reviews.findByProductAndUser(product.id, user.id);

    if (existing) {
      return {
        canReview: false,
        reason:
          existing.status === 'rejected'
            ? 'Your review for this product was not published'
            : 'You have already reviewed this product',
        existingReviewId: existing.id,
        existingReviewStatus: existing.status,
        orderNumber: existing.orderNumber,
      };
    }

    const purchase = await this.findDeliveredPurchase(user.id, product.id);

    if (!purchase) {
      return {
        canReview: false,
        reason: 'Only customers who received this product can review it',
        existingReviewId: null,
        existingReviewStatus: null,
        orderNumber: null,
      };
    }

    return {
      canReview: true,
      reason: null,
      existingReviewId: null,
      existingReviewStatus: null,
      orderNumber: purchase.orderNumber,
    };
  }

  async create(
    idOrSlug: string,
    dto: CreateReviewDto,
    user: AuthenticatedUser,
  ): Promise<ReviewView> {
    const product = await this.productsService.getPublic(idOrSlug);
    const existing = await this.reviews.findByProductAndUser(product.id, user.id);

    if (existing) {
      throw new ConflictException('You have already reviewed this product');
    }

    const purchase = await this.findDeliveredPurchase(user.id, product.id);

    if (!purchase) {
      throw new ForbiddenException(
        'Only customers who received this product can review it',
      );
    }

    const created = await this.reviews.create({
      productId: product.id,
      userId: user.id,
      // The delivery address holds the name the customer actually uses; the JWT
      // only carries an email, which is a poor display name.
      customerName: purchase.customerName?.trim() || this.customerNameOf(user),
      customerEmail: user.email,
      orderId: purchase.orderId,
      orderNumber: purchase.orderNumber,
      rating: dto.rating,
      title: dto.title?.trim() || null,
      comment: dto.comment.trim(),
    });

    // Lost a race with a simultaneous submit: the index refused the duplicate.
    if (!created) {
      throw new ConflictException('You have already reviewed this product');
    }

    return this.toView(created, { name: product.name, slug: product.slug });
  }

  async productReviews(
    idOrSlug: string,
    query: ProductReviewsQueryDto,
  ): Promise<PaginatedResult<PublicReviewView>> {
    const product = await this.productsService.getPublic(idOrSlug);
    const { items, total } = await this.reviews.list({
      page: query.page,
      limit: query.limit,
      productId: product.id,
      approvedOnly: true,
      rating: query.rating,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return createPaginatedResult(
      items.map((review) => this.toPublicView(review)),
      query.page,
      query.limit,
      total,
    );
  }

  async productRating(idOrSlug: string): Promise<ProductRatingView> {
    const product = await this.productsService.getPublic(idOrSlug);
    const counts = await this.reviews.counts({ productId: product.id });
    const total = counts.approved;

    return {
      productId: product.id,
      reviewCount: total,
      averageRating: counts.averageRating,
      distribution: [5, 4, 3, 2, 1].map((stars) => {
        const count = counts.ratingDistribution[String(stars) as '1'];

        return {
          stars,
          count,
          percent: total === 0 ? 0 : Math.round((count / total) * 100),
        };
      }),
    };
  }

  async myReviews(
    user: AuthenticatedUser,
    query: MyReviewsQueryDto,
  ): Promise<PaginatedResult<ReviewView>> {
    const { items, total } = await this.reviews.list({
      page: query.page,
      limit: query.limit,
      userId: user.id,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    const products = await this.productLookup(items.map((review) => review.productId));

    return createPaginatedResult(
      items.map((review) => this.toView(review, products.get(review.productId))),
      query.page,
      query.limit,
      total,
    );
  }

  /* ------------------------------------------------------------------- admin */

  async list(query: ReviewsQueryDto): Promise<PaginatedResult<ReviewView>> {
    const { items, total } = await this.reviews.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      productId: query.productId,
      rating: query.rating,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    const products = await this.productLookup(items.map((review) => review.productId));

    return createPaginatedResult(
      items.map((review) => this.toView(review, products.get(review.productId))),
      query.page,
      query.limit,
      total,
    );
  }

  async summary(): Promise<ReviewSummaryView> {
    const counts = await this.reviews.counts();

    return {
      total: counts.total,
      pending: counts.pending,
      approved: counts.approved,
      rejected: counts.rejected,
      averageRating: counts.averageRating,
      ratingDistribution: counts.ratingDistribution,
    };
  }

  async get(id: string): Promise<ReviewView> {
    const review = await this.requireReview(id);
    const products = await this.productLookup([review.productId]);

    return this.toView(review, products.get(review.productId));
  }

  async moderate(
    id: string,
    dto: ModerateReviewDto,
    actor: AuthenticatedUser,
  ): Promise<ReviewView> {
    const review = await this.requireReview(id);
    const reason = dto.reason?.trim() || null;

    if (dto.status === 'rejected' && !reason) {
      throw new BadRequestException('Give a reason when rejecting a review');
    }

    const updated = await this.reviews.moderate(id, {
      status: dto.status,
      reason,
      by: { userId: actor.id, email: actor.email },
      at: new Date(),
    });

    if (!updated) {
      throw new ConflictException(
        `This review is already ${REVIEW_STATUS_LABELS[dto.status].toLowerCase()}`,
      );
    }

    // A published or un-published rating changes the product's cached average, so
    // the storefront card and the "highest rated" sort stay truthful.
    await this.syncProductRating(review.productId);

    const products = await this.productLookup([review.productId]);

    return this.toView(updated, products.get(updated.productId));
  }

  async remove(id: string): Promise<{ deleted: true }> {
    // The id is gone after the delete, and the rating has to be recomputed for it.
    const review = await this.requireReview(id);
    const deleted = await this.reviews.remove(id);

    if (!deleted) {
      throw new NotFoundException('Review not found');
    }

    await this.syncProductRating(review.productId);

    return { deleted: true };
  }

  /**
   * Recomputes a product's cached rating from its approved reviews.
   *
   * `counts()` is already the authority (the summary endpoints read it), so the
   * product document is just a copy of that answer — one code path, no second
   * definition of "average".
   */
  private async syncProductRating(productId: string): Promise<void> {
    const counts = await this.reviews.counts({ productId });

    await this.productsService.syncRating(
      productId,
      counts.averageRating ?? 0,
      counts.approved,
    );
  }

  /* ---------------------------------------------------------------- internal */

  private async requireReview(id: string): Promise<ReviewRecord> {
    const review = await this.reviews.findById(id);

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  /**
   * Finds a delivered order from this customer that contains the product.
   *
   * Scanning a bounded page of delivered orders keeps the check inside the orders
   * contract (no schema coupling) and is indexed by `userId` + `status`.
   */
  private async findDeliveredPurchase(
    userId: string,
    productId: string,
  ): Promise<{
    orderId: string;
    orderNumber: string;
    customerName: string;
  } | null> {
    const { items } = await this.orders.list({
      page: 1,
      limit: MAX_DELIVERED_ORDERS_SCANNED,
      userId,
      status: 'delivered',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const order = items.find((candidate) =>
      candidate.items.some((item) => item.productId === productId),
    );

    return order
      ? {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
        }
      : null;
  }

  /** Product names for a page of reviews, with a graceful fallback. */
  private async productLookup(
    ids: string[],
  ): Promise<Map<string, { name: string; slug: string }>> {
    const unique = [...new Set(ids)];
    const entries = await Promise.all(
      unique.map(async (id) => {
        try {
          const product = await this.productsService.getForAdmin(id);

          return [id, { name: product.name, slug: product.slug }] as const;
        } catch {
          // Archived products keep their reviews; only the label is missing.
          return [id, { name: 'Removed product', slug: '' }] as const;
        }
      }),
    );

    return new Map(entries);
  }

  private customerNameOf(user: AuthenticatedUser): string {
    const local = user.email.split('@')[0];

    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private toView(
    review: ReviewRecord,
    product?: { name: string; slug: string },
  ): ReviewView {
    return {
      id: review.id,
      productId: review.productId,
      productName: product?.name ?? 'Removed product',
      productSlug: product?.slug ?? '',
      customerName: review.customerName,
      customerEmail: review.customerEmail,
      rating: review.rating,
      ratingLabel: ratingLabel(review.rating),
      title: review.title,
      comment: review.comment,
      status: review.status,
      statusLabel: REVIEW_STATUS_LABELS[review.status],
      verifiedPurchase: true,
      orderId: review.orderId,
      orderNumber: review.orderNumber,
      moderatedBy: review.moderatedBy?.email ?? null,
      moderatedAt: review.moderatedAt ? review.moderatedAt.toISOString() : null,
      moderationReason: review.moderationReason,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  private toPublicView(review: ReviewRecord): PublicReviewView {
    return {
      id: review.id,
      rating: review.rating,
      ratingLabel: ratingLabel(review.rating),
      title: review.title,
      comment: review.comment,
      // Public pages show "Asha R." — enough to feel human, not enough to identify.
      author: maskName(review.customerName),
      verifiedPurchase: true,
      createdAt: review.createdAt.toISOString(),
    };
  }
}

function ratingLabel(rating: number): string {
  return `${rating} ${rating === 1 ? 'star' : 'stars'}`;
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'Customer';
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
