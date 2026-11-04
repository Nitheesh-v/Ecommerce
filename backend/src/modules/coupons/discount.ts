import type { DiscountType } from './schemas/offer.schema.js';

/**
 * The coupon maths.
 *
 * One pure function, used by both the checkout preview (`POST /api/coupons/validate`)
 * and order creation, so a previewed discount and a charged discount can never
 * differ. It only decides **how much** the coupon takes off; the final totals still
 * come from `orders/pricing.ts` (`computeTotals`), which is the single pricing
 * formula — this module never computes a subtotal, shipping or tax of its own.
 *
 * Rules:
 * - only lines covered by the offer count towards both the discount base and the
 *   minimum cart value;
 * - an exclusion always beats an inclusion;
 * - a fixed discount never exceeds the eligible goods value;
 * - a percentage discount is floor()ed (never over-charges the store) and capped
 *   by `maxDiscount` when one is set.
 */

export interface CouponLine {
  productId: string;
  categoryId: string | null;
  /** What the customer pays per unit, minor units. */
  unitPrice: number;
  quantity: number;
}

export interface OfferRule {
  type: DiscountType;
  value: number;
  minCartValue: number;
  maxDiscount: number | null;
  applicableProductIds: ArrayLike<string>;
  applicableCategoryIds: ArrayLike<string>;
  excludedProductIds: ArrayLike<string>;
  excludedCategoryIds: ArrayLike<string>;
}

export type Ineligibility = 'no_eligible_items' | 'below_minimum';

export interface DiscountEvaluation {
  /** Goods value the offer may discount (eligible lines only), minor units. */
  eligibleSubtotal: number;
  /** Discount on goods, minor units. 0 for a free-shipping offer. */
  discount: number;
  freeShipping: boolean;
  /** Why the offer cannot be applied to *this* cart, if it cannot. */
  reason: Ineligibility | null;
  /** How much more is needed to reach the minimum, minor units. */
  shortfall: number;
}

export function evaluateOffer(
  offer: OfferRule,
  lines: CouponLine[],
): DiscountEvaluation {
  const applicableProducts = toSet(offer.applicableProductIds);
  const applicableCategories = toSet(offer.applicableCategoryIds);
  const excludedProducts = toSet(offer.excludedProductIds);
  const excludedCategories = toSet(offer.excludedCategoryIds);
  const restricted =
    applicableProducts.size > 0 || applicableCategories.size > 0;

  let eligibleSubtotal = 0;
  let eligibleUnits = 0;

  for (const line of lines) {
    if (excludedProducts.has(line.productId)) {
      continue;
    }
    if (line.categoryId && excludedCategories.has(line.categoryId)) {
      continue;
    }
    if (
      restricted &&
      !applicableProducts.has(line.productId) &&
      !(line.categoryId && applicableCategories.has(line.categoryId))
    ) {
      continue;
    }

    eligibleSubtotal += Math.max(0, line.unitPrice) * Math.max(0, line.quantity);
    eligibleUnits += Math.max(0, line.quantity);
  }

  const freeShipping = offer.type === 'free_shipping';
  const shortfall = Math.max(0, offer.minCartValue - eligibleSubtotal);

  if (eligibleUnits === 0) {
    return {
      eligibleSubtotal: 0,
      discount: 0,
      freeShipping: false,
      reason: 'no_eligible_items',
      shortfall,
    };
  }

  if (shortfall > 0) {
    return {
      eligibleSubtotal,
      discount: 0,
      freeShipping: false,
      reason: 'below_minimum',
      shortfall,
    };
  }

  return {
    eligibleSubtotal,
    discount: discountFor(offer, eligibleSubtotal),
    freeShipping,
    reason: null,
    shortfall: 0,
  };
}

export function discountFor(offer: OfferRule, eligibleSubtotal: number): number {
  if (offer.type === 'free_shipping') {
    return 0;
  }

  if (offer.type === 'percentage') {
    const raw = Math.floor((eligibleSubtotal * offer.value) / 100);
    const capped =
      offer.maxDiscount === null ? raw : Math.min(raw, offer.maxDiscount);

    return clamp(capped, 0, eligibleSubtotal);
  }

  return clamp(Math.trunc(offer.value), 0, eligibleSubtotal);
}

/** Customer-facing explanation for a cart a coupon cannot apply to. */
export function describeIneligibility(
  evaluation: DiscountEvaluation,
  offer: { type: DiscountType; minCartValue: number; currency?: string },
): string {
  if (evaluation.reason === 'no_eligible_items') {
    return 'This coupon does not apply to the items in your cart';
  }
  if (evaluation.reason === 'below_minimum') {
    return `Add ${formatMoney(evaluation.shortfall, offer.currency ?? 'INR')} more of eligible items to use this coupon`;
  }

  return '';
}

function formatMoney(minorUnits: number, currency: string): string {
  const amount = (minorUnits / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });

  return currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`;
}

function toSet(values: ArrayLike<string>): Set<string> {
  const set = new Set<string>();

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value) {
      set.add(String(value));
    }
  }

  return set;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
