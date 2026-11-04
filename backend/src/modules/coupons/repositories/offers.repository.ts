import type {
  DiscountType,
  OfferLifecycleStatus,
  RedemptionStatus,
} from '../schemas/offer.schema.js';

export interface OfferActor {
  userId?: string;
  email?: string;
}

export interface OfferHistoryRecord {
  action: string;
  note?: string;
  by?: OfferActor | null;
  at: Date;
}

export interface OfferRecord {
  id: string;
  name: string;
  description?: string;
  code: string;
  type: DiscountType;
  value: number;
  minCartValue: number;
  maxDiscount: number | null;
  startsAt: Date;
  endsAt: Date;
  totalUsageLimit: number | null;
  perCustomerLimit: number;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  excludedProductIds: string[];
  excludedCategoryIds: string[];
  customerVisible: boolean;
  isActive: boolean;
  usageCount: number;
  redeemedCount: number;
  createdBy: OfferActor | null;
  updatedBy: OfferActor | null;
  history: OfferHistoryRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOfferInput {
  name: string;
  description?: string;
  code: string;
  type: DiscountType;
  value: number;
  minCartValue: number;
  maxDiscount: number | null;
  startsAt: Date;
  endsAt: Date;
  totalUsageLimit: number | null;
  perCustomerLimit: number;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  excludedProductIds: string[];
  excludedCategoryIds: string[];
  customerVisible: boolean;
  isActive: boolean;
  createdBy: OfferActor | null;
  history: OfferHistoryRecord[];
}

export type OfferSortField =
  | 'createdAt'
  | 'startsAt'
  | 'endsAt'
  | 'usageCount'
  | 'name';

export const OFFER_SORT_FIELDS: OfferSortField[] = [
  'createdAt',
  'startsAt',
  'endsAt',
  'usageCount',
  'name',
];

export interface OfferListFilter {
  page: number;
  limit: number;
  search?: string;
  /** Derived status — translated into date/counter predicates by the repository. */
  status?: OfferLifecycleStatus;
  type?: DiscountType;
  /** Overlap window against `[startsAt, endsAt]`. */
  from?: Date;
  to?: Date;
  sortBy: OfferSortField;
  sortOrder: 'asc' | 'desc';
  /** "Now" for the derived status (injectable for tests). */
  now: Date;
}

export interface OfferCountsRecord {
  totalOffers: number;
  activeOffers: number;
  scheduledOffers: number;
  expiredOffers: number;
  exhaustedOffers: number;
  inactiveOffers: number;
}

export interface OfferUpdate {
  name?: string;
  description?: string | null;
  code?: string;
  type?: DiscountType;
  value?: number;
  minCartValue?: number;
  maxDiscount?: number | null;
  startsAt?: Date;
  endsAt?: Date;
  totalUsageLimit?: number | null;
  perCustomerLimit?: number;
  applicableProductIds?: string[];
  applicableCategoryIds?: string[];
  excludedProductIds?: string[];
  excludedCategoryIds?: string[];
  customerVisible?: boolean;
  isActive?: boolean;
  updatedBy?: OfferActor | null;
  history?: OfferHistoryRecord[];
}

/** Public projection of a usable offer (`/api/offers/active`). */
export interface PublicOfferRecord {
  id: string;
  name: string;
  description?: string;
  code: string;
  type: DiscountType;
  value: number;
  minCartValue: number;
  maxDiscount: number | null;
  startsAt: Date;
  endsAt: Date;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
}

/**
 * Persistence boundary for offers.
 *
 * Usage limits live here because they must be enforced by an atomic database
 * operation: two checkouts using the last remaining use of a coupon must not both
 * succeed, and a read-then-write in the service could never guarantee that.
 */
export abstract class OffersRepository {
  /** `null` when the code already exists (unique index, case-normalised). */
  abstract create(input: CreateOfferInput): Promise<OfferRecord | null>;

  abstract findById(id: string): Promise<OfferRecord | null>;

  /** Case-insensitive lookup (`code` is stored uppercase). */
  abstract findByCode(code: string): Promise<OfferRecord | null>;

  abstract list(
    filter: OfferListFilter,
  ): Promise<{ items: OfferRecord[]; total: number }>;

  /** Offer-count cards for the console (redemption totals come from their own repository). */
  abstract counts(now: Date): Promise<OfferCountsRecord>;

  /** `null` when the code was taken by another offer. */
  abstract update(id: string, update: OfferUpdate): Promise<OfferRecord | null>;

  /**
   * Atomically claims one use of the offer for a customer.
   *
   * Returns `false` when the total limit, the per-customer limit or a closed offer
   * blocks the claim — and leaves both counters untouched in that case, so a failed
   * attempt never leaks against the limit.
   */
  abstract reserveUsage(
    id: string,
    input: { customerKey: string; now: Date },
  ): Promise<boolean>;

  /** Releases a reservation (reversal, cancellation, or a failed order write). */
  abstract releaseUsage(id: string, customerKey: string): Promise<void>;

  /** Increments the "money actually discounted" counter once a redemption lands. */
  abstract markRedeemed(id: string): Promise<void>;

  /** Decrements it again when a confirmed order is later cancelled or returned. */
  abstract unmarkRedeemed(id: string): Promise<void>;

  /** How many times this customer has used the offer (non-reversed). */
  abstract customerUsage(id: string, customerKey: string): Promise<number>;

  /** Customer-visible offers that are usable right now. */
  abstract listPublic(
    query: { search?: string; limit: number },
    now: Date,
  ): Promise<PublicOfferRecord[]>;
}

// --------------------------------------------------------------- redemptions

export interface RedemptionRecord {
  redemptionId: string;
  offerId: string;
  code: string;
  type: DiscountType;
  value: number;
  orderId: string | null;
  orderNumber: string | null;
  userId: string | null;
  customerEmail: string;
  discountAmount: number;
  freeShipping: boolean;
  status: RedemptionStatus;
  reservedAt: Date;
  redeemedAt: Date | null;
  reversedAt: Date | null;
  reversalReason: string | null;
}

export interface CreateRedemptionInput {
  redemptionId: string;
  offerId: string;
  code: string;
  type: DiscountType;
  value: number;
  userId: string | null;
  customerEmail: string;
  discountAmount: number;
  freeShipping: boolean;
  reservedAt: Date;
}

export interface RedemptionListFilter {
  page: number;
  limit: number;
  search?: string;
  status?: RedemptionStatus;
  offerId?: string;
  from?: Date;
  to?: Date;
  sortBy: 'reservedAt' | 'redeemedAt' | 'discountAmount';
  sortOrder: 'asc' | 'desc';
}

export interface RedemptionSummaryRecord {
  /** Finalised (`redeemed`) redemptions. */
  totalRedemptions: number;
  /** Sum of their discounts, minor units. */
  totalDiscountGiven: number;
}

export abstract class RedemptionsRepository {
  abstract create(input: CreateRedemptionInput): Promise<RedemptionRecord | null>;

  abstract findById(redemptionId: string): Promise<RedemptionRecord | null>;

  /** Links a reservation to the order that used it (idempotent). */
  abstract attachOrder(
    redemptionId: string,
    order: { orderId: string; orderNumber: string },
  ): Promise<void>;

  /** reserved → redeemed. Returns `false` when it was already finalised. */
  abstract confirm(redemptionId: string, at: Date): Promise<boolean>;

  /**
   * Closes a redemption because its order was cancelled or returned.
   * Returns the status it had *before* the reversal, or `null` when already closed.
   */
  abstract reverse(
    redemptionId: string,
    input: { at: Date; reason: string },
  ): Promise<RedemptionStatus | null>;

  /** The redemption attached to an order, if any. */
  abstract findByOrderId(orderId: string): Promise<RedemptionRecord | null>;

  abstract list(
    filter: RedemptionListFilter,
  ): Promise<{ items: RedemptionRecord[]; total: number }>;

  abstract summary(offerId?: string): Promise<RedemptionSummaryRecord>;
}
