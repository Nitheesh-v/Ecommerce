import type {
  DiscountType,
  OfferLifecycleStatus,
} from './schemas/offer.schema.js';

/**
 * Offer status is **derived**, never scheduled.
 *
 * There is no cron job flipping a flag at midnight: `scheduled`, `active`,
 * `expired` and `exhausted` are computed from the stored dates, the switch and the
 * usage counter, so the console and the checkout can never disagree about whether
 * a code works right now.
 */
export interface OfferStatusInput {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  totalUsageLimit: number | null;
  usageCount: number;
}

export function offerStatus(
  offer: OfferStatusInput,
  now: Date = new Date(),
): OfferLifecycleStatus {
  if (!offer.isActive) {
    return 'inactive';
  }
  if (offer.usageCount >= Number.MAX_SAFE_INTEGER) {
    // Defensive: an impossible counter can never look active.
    return 'exhausted';
  }
  if (now.getTime() < offer.startsAt.getTime()) {
    return 'scheduled';
  }
  if (now.getTime() > offer.endsAt.getTime()) {
    return 'expired';
  }
  if (offer.totalUsageLimit !== null && offer.usageCount >= offer.totalUsageLimit) {
    return 'exhausted';
  }

  return 'active';
}

/** Statuses for which a coupon may currently be applied. */
export function isUsable(status: OfferLifecycleStatus): boolean {
  return status === 'active';
}

export const OFFER_STATUS_LABELS: Record<OfferLifecycleStatus, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  expired: 'Expired',
  exhausted: 'Usage limit reached',
  inactive: 'Inactive',
};

/** Human sentence explaining why a code cannot be used, shown to the customer. */
export function unavailableReason(status: OfferLifecycleStatus): string {
  switch (status) {
    case 'scheduled':
      return 'This coupon is not active yet';
    case 'expired':
      return 'This coupon has expired';
    case 'exhausted':
      return 'This coupon has reached its usage limit';
    case 'inactive':
      return 'This coupon is no longer available';
    default:
      return '';
  }
}

export function discountTypeLabel(type: DiscountType): string {
  return type === 'percentage'
    ? 'Percentage off'
    : type === 'fixed'
      ? 'Amount off'
      : 'Free shipping';
}

/** Short human summary of the value, e.g. "20% off" or "₹150 off". */
export function describeDiscount(
  type: DiscountType,
  value: number,
  currency = 'INR',
): string {
  if (type === 'free_shipping') {
    return 'Free shipping';
  }
  if (type === 'percentage') {
    return `${trimNumber(value)}% off`;
  }

  return `${formatMoney(value, currency)} off`;
}

function formatMoney(minorUnits: number, currency: string): string {
  const amount = (minorUnits / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });

  return currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
