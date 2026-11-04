import type { DiscountType } from './schemas/offer.schema.js';

/**
 * The seam between checkout and coupons.
 *
 * The orders module asks this port to price a coupon; it knows nothing about
 * offers, codes or limits, and coupons know nothing about how an order is written.
 * That keeps the dependency one-way — **orders → coupons** — with the coupon module
 * listening to order events for the redemption lifecycle instead of being called
 * back from inside an order write.
 */

export interface CouponPricingLine {
  productId: string;
  categoryId: string | null;
  /** Charged price per unit (minor units), from the product record. */
  unitPrice: number;
  quantity: number;
}

export interface CouponQuoteInput {
  code: string;
  lines: CouponPricingLine[];
  /** Identity used for per-customer limits. Guests fall back to their email. */
  userId: string | null;
  customerEmail: string;
}

export interface CouponQuote {
  offerId: string;
  code: string;
  name: string;
  type: DiscountType;
  value: number;
  minCartValue: number;
  maxDiscount: number | null;
  /** Goods discount, minor units. */
  discount: number;
  freeShipping: boolean;
  eligibleSubtotal: number;
  /** Customer-facing phrase, e.g. "20% off". */
  summary: string;
}

/** Where a reservation stands once the order carrying it is written. */
export interface CouponReservationInput {
  quote: CouponQuote;
  userId: string | null;
  customerEmail: string;
}

export abstract class CouponPricingService {
  /**
   * Validates a code against a cart and returns the discount that **will** be
   * applied. Throws a `BadRequestException` carrying a customer-safe reason when
   * the coupon cannot be used.
   */
  abstract quote(input: CouponQuoteInput): Promise<CouponQuote>;

  /** Claims one use (atomic) and returns the reservation id. */
  abstract reserve(input: CouponReservationInput): Promise<string>;

  /** Links the reservation to the order that was just written. */
  abstract attach(
    redemptionId: string,
    order: { orderId: string; orderNumber: string },
  ): Promise<void>;

  /** Hands the use back when the order write fails. */
  abstract release(redemptionId: string): Promise<void>;
}
