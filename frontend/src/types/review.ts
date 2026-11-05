/**
 * Reviews & ratings.
 *
 * Mirrors the API views. A review is only ever written by a verified buyer and is
 * `pending` until an admin approves it; `PublicReview` is the narrow projection the
 * storefront shows (masked author, no email, no order).
 */

export type ReviewStatus = "pending" | "approved" | "rejected";

export type ReviewSortField = "createdAt" | "rating" | "status";

export interface AdminReview {
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
  verifiedPurchase: boolean;
  orderId: string;
  orderNumber: string;
  moderatedBy: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicReview {
  id: string;
  rating: number;
  ratingLabel: string;
  title: string | null;
  comment: string;
  author: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface ProductRating {
  productId: string;
  reviewCount: number;
  averageRating: number | null;
  distribution: Array<{ stars: number; count: number; percent: number }>;
}

export interface ReviewSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  averageRating: number | null;
  ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export interface ReviewEligibility {
  canReview: boolean;
  reason: string | null;
  existingReviewId: string | null;
  existingReviewStatus: ReviewStatus | null;
  orderNumber: string | null;
}

export interface ReviewListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ReviewStatus;
  productId?: string;
  rating?: number;
  from?: string;
  to?: string;
  sortBy?: ReviewSortField;
  sortOrder?: "asc" | "desc";
}

export interface ReviewWritePayload {
  rating: number;
  title?: string;
  comment: string;
}
