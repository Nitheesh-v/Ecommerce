/**
 * Offers, coupons and redemptions.
 *
 * These mirror the API views field-for-field. Money is always integer minor units
 * (paise) and percentages are whole numbers; the browser never computes a total,
 * it only renders what the server priced.
 */

export type DiscountType = "percentage" | "fixed" | "free_shipping";

export type OfferLifecycleStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "exhausted"
  | "inactive";

export type RedemptionStatus = "reserved" | "redeemed" | "reversed";

export type OfferSortField =
  | "createdAt"
  | "startsAt"
  | "endsAt"
  | "name"
  | "usageCount";

export interface AdminOffer {
  id: string;
  name: string;
  description: string | null;
  code: string;
  type: DiscountType;
  typeLabel: string;
  value: number;
  /** Ready-made label: "20% off", "₹150 off", "Free shipping". */
  valueLabel: string;
  minCartValue: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  totalUsageLimit: number | null;
  perCustomerLimit: number;
  usageCount: number;
  redeemedCount: number;
  remainingUses: number | null;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  excludedProductIds: string[];
  excludedCategoryIds: string[];
  customerVisible: boolean;
  isActive: boolean;
  status: OfferLifecycleStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfferHistoryEntry {
  action: string;
  note: string | null;
  by: string | null;
  at: string;
}

export interface OfferDetail extends AdminOffer {
  history: OfferHistoryEntry[];
  createdBy: string | null;
  updatedBy: string | null;
  redemptionCount: number;
  discountGiven: number;
}

export interface OfferSummary {
  totalOffers: number;
  activeOffers: number;
  scheduledOffers: number;
  expiredOffers: number;
  exhaustedOffers: number;
  inactiveOffers: number;
  totalRedemptions: number;
  totalDiscountGiven: number;
}

export interface OfferListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OfferLifecycleStatus;
  type?: DiscountType;
  /** ISO dates — offers that overlap the window. */
  from?: string;
  to?: string;
  sortBy?: OfferSortField;
  sortOrder?: "asc" | "desc";
}

export interface OfferWritePayload {
  name: string;
  description?: string;
  code: string;
  type: DiscountType;
  value: number;
  minCartValue?: number;
  maxDiscount?: number;
  startsAt: string;
  endsAt: string;
  totalUsageLimit?: number;
  perCustomerLimit?: number;
  applicableProductIds?: string[];
  applicableCategoryIds?: string[];
  excludedProductIds?: string[];
  excludedCategoryIds?: string[];
  customerVisible?: boolean;
  isActive?: boolean;
}

export interface CouponRedemption {
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
  statusLabel: string;
  reservedAt: string;
  redeemedAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface RedemptionListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: RedemptionStatus;
  offerId?: string;
  from?: string;
  to?: string;
  sortBy?: "reservedAt" | "redeemedAt" | "discountAmount";
  sortOrder?: "asc" | "desc";
}

/** Public offer shown on `/offers` — no internal campaign settings. */
export interface PublicOffer {
  id: string;
  name: string;
  description: string | null;
  code: string;
  type: DiscountType;
  value: number;
  valueLabel: string;
  minCartValue: number;
  minCartLabel: string | null;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  applicableCategories: Array<{ id: string; name: string }>;
  applicableProducts: Array<{ id: string; name: string }>;
}

/** Server-priced coupon preview. */
export interface CouponValidation {
  valid: true;
  code: string;
  offerId: string;
  name: string;
  type: DiscountType;
  value: number;
  valueLabel: string;
  eligibleSubtotal: number;
  discount: number;
  freeShipping: boolean;
  subtotal: number;
  shippingCharge: number;
  taxAmount: number;
  total: number;
  currency: string;
  message: string;
}
