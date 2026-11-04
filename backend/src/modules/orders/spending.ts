/**
 * One definition of "customer spending" and "revenue", shared by the customer
 * module and the admin dashboard.
 *
 * Rules (agreed with the brief):
 *  - **Cancelled and returned orders never count.** The sale was called off.
 *  - **Money that was never collected never counts** (`payment.paidAmount` is the
 *    only trusted figure — a pending/failed payment contributes nothing, even if
 *    the order itself is progressing).
 *  - **Refunds are netted out when they are actually processed.** A *pending*
 *    refund is an obligation, not money returned, so it is reported separately.
 *
 * Two consumers read this module:
 *  - JavaScript (services, the in-memory test repository) via `isSuccessfulPurchase`
 *    and `orderNetSpent`;
 *  - MongoDB aggregation (customer metrics, dashboard revenue) via
 *    `SPENDING_MATCH`, `NET_SPEND_EXPR` and `PROCESSED_REFUND_EXPR`.
 *
 * The pipeline expressions mirror the JS helpers exactly; keep them in step.
 */

/** Statuses whose money is not counted as spending. */
export const NON_SPENDING_STATUSES = ['cancelled', 'returned'] as const;

/** The minimum an order must expose to be measured (order docs and views both qualify). */
export interface SpendableOrder {
  status: string;
  payment?: {
    paidAmount?: number | null;
    refunds?: Array<{ amount?: number | null; status?: string | null }> | null;
  } | null;
}

/** `true` when the order represents money the business actually earned. */
export function isSuccessfulPurchase(order: SpendableOrder): boolean {
  const paidAmount = order.payment?.paidAmount ?? 0;

  return paidAmount > 0 && !NON_SPENDING_STATUSES.includes(order.status as never);
}

/** Refunded money that has definitely left the account. */
export function processedRefundsTotal(order: SpendableOrder): number {
  return (order.payment?.refunds ?? [])
    .filter((refund) => refund.status === 'processed')
    .reduce((sum, refund) => sum + Math.max(0, refund.amount ?? 0), 0);
}

/** Refunded money that is queued but not yet paid out. */
export function pendingRefundsTotal(order: SpendableOrder): number {
  return (order.payment?.refunds ?? [])
    .filter((refund) => refund.status === 'pending')
    .reduce((sum, refund) => sum + Math.max(0, refund.amount ?? 0), 0);
}

/** Net spend contributed by one order (never negative). */
export function orderNetSpent(order: SpendableOrder): number {
  if (!isSuccessfulPurchase(order)) {
    return 0;
  }

  const paid = order.payment?.paidAmount ?? 0;

  return Math.max(0, paid - processedRefundsTotal(order));
}

/** Mongo filter for "counts towards spending" documents. */
export const SPENDING_MATCH = {
  'payment.paidAmount': { $gt: 0 },
  status: { $nin: [...NON_SPENDING_STATUSES] },
} as const;

/** Aggregation expression: sum of *processed* refunds on the current document. */
export const PROCESSED_REFUND_EXPR = {
  $sum: {
    $map: {
      input: {
        $filter: {
          input: { $ifNull: ['$payment.refunds', []] },
          as: 'refund',
          cond: { $eq: ['$$refund.status', 'processed'] },
        },
      },
      as: 'refund',
      in: { $ifNull: ['$$refund.amount', 0] },
    },
  },
} as const;

/** Aggregation expression: pending (queued) refunds. */
export const PENDING_REFUND_EXPR = {
  $sum: {
    $map: {
      input: {
        $filter: {
          input: { $ifNull: ['$payment.refunds', []] },
          as: 'refund',
          cond: { $eq: ['$$refund.status', 'pending'] },
        },
      },
      as: 'refund',
      in: { $ifNull: ['$$refund.amount', 0] },
    },
  },
} as const;

/**
 * Aggregation expression: `max(0, paidAmount − processedRefunds)`.
 *
 * Use it together with `SPENDING_MATCH` so unpaid/cancelled orders never reach the
 * arithmetic.
 */
export const NET_SPEND_EXPR = {
  $max: [
    0,
    {
      $subtract: [
        { $ifNull: ['$payment.paidAmount', 0] },
        PROCESSED_REFUND_EXPR,
      ],
    },
  ],
} as const;
