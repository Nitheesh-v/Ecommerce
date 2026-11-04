import type { PaymentStatus } from './schemas/payment.schema.js';

/**
 * Payment state machine.
 *
 * The only states that represent **collected money** are `captured`,
 * `partially_refunded` and `refunded`. Everything else is either in flight or
 * finished without money moving, and nothing in this table can move a payment
 * *backwards* into a paid state.
 *
 * Refund states are entered only from `captured` (by a verified refund), never
 * from `failed`/`cancelled`/`pending` — a cancellation is not a refund.
 */
export const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['authorized', 'captured', 'failed', 'cancelled'],
  authorized: ['captured', 'failed', 'cancelled'],
  captured: ['partially_refunded', 'refunded'],
  partially_refunded: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  authorized: 'Authorized',
  captured: 'Captured',
  failed: 'Failed',
  cancelled: 'Cancelled',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

/** Statuses that mean "money was actually collected". */
export const SETTLED_PAYMENT_STATUSES: PaymentStatus[] = [
  'captured',
  'partially_refunded',
  'refunded',
];

/** Statuses that can still move. */
export const OPEN_PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'authorized'];

/** Statuses where a refund may be initiated. */
export const REFUNDABLE_PAYMENT_STATUSES: PaymentStatus[] = [
  'captured',
  'partially_refunded',
];

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isSettled(status: PaymentStatus): boolean {
  return SETTLED_PAYMENT_STATUSES.includes(status);
}

export function isOpen(status: PaymentStatus): boolean {
  return OPEN_PAYMENT_STATUSES.includes(status);
}

export function isRefundable(status: PaymentStatus): boolean {
  return REFUNDABLE_PAYMENT_STATUSES.includes(status);
}

/**
 * Status after applying the order's **processed** refund total.
 *
 * `processedRefunded === amount` ⇒ fully refunded, any smaller positive total ⇒
 * partially refunded, none ⇒ unchanged. Pending refunds never change the status:
 * an obligation is not money returned.
 */
export function statusAfterRefunds(
  current: PaymentStatus,
  amount: number,
  processedRefunded: number,
): PaymentStatus {
  if (current === 'refunded' || current === 'partially_refunded' || current === 'captured') {
    if (processedRefunded <= 0) {
      return current === 'refunded' ? 'refunded' : 'captured';
    }
    if (processedRefunded >= amount) {
      return 'refunded';
    }

    return 'partially_refunded';
  }

  return current;
}
