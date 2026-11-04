import { Injectable, Logger } from '@nestjs/common';
import type { OrderRecord } from './repositories/orders.repository.js';

/** Notified after an order's refund ledger changes. */
export type RefundChangedListener = (order: OrderRecord) => Promise<void> | void;

/** Notified after an order's fulfilment status changes. */
export type StatusChangedListener = (
  order: OrderRecord,
) => Promise<void> | void;

/**
 * Minimal in-process event bus for order money events.
 *
 * Refunds are owned by the order (`payment.refunds[]`) — that is the single
 * source of truth for money returned. The payments module keeps a *mirror* of the
 * refund totals on each gateway transaction so the console can filter on
 * "partially refunded"/"refunded" without joining every order.
 *
 * Rather than let the payments module into the order write path (which would
 * create a module cycle), `OrdersService` publishes here and the payments module
 * subscribes on boot. When payments is not loaded — or a listener throws — order
 * writes are unaffected: a mirror must never fail a refund.
 */
@Injectable()
export class OrderEvents {
  private readonly logger = new Logger(OrderEvents.name);
  private readonly refundListeners = new Set<RefundChangedListener>();
  private readonly statusListeners = new Set<StatusChangedListener>();

  /** @returns an unsubscribe function (called on module destroy). */
  onRefundChanged(listener: RefundChangedListener): () => void {
    this.refundListeners.add(listener);

    return () => {
      this.refundListeners.delete(listener);
    };
  }

  /** @returns an unsubscribe function (called on module destroy). */
  onStatusChanged(listener: StatusChangedListener): () => void {
    this.statusListeners.add(listener);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Publishes a fulfilment-status change.
   *
   * Same contract as the refund bus: listeners are best-effort, and a failing
   * listener is logged rather than allowed to fail the order write. Coupons use
   * this to confirm or reverse a redemption without the orders module knowing
   * anything about coupons.
   */
  async emitStatusChanged(order: OrderRecord): Promise<void> {
    if (this.statusListeners.size === 0) {
      return;
    }

    const results = await Promise.allSettled(
      [...this.statusListeners].map(async (listener) => listener(order)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `A status listener failed for order ${order.orderNumber}: ${String(result.reason)}`,
        );
      }
    }
  }

  async emitRefundChanged(order: OrderRecord): Promise<void> {
    if (this.refundListeners.size === 0) {
      return;
    }

    const results = await Promise.allSettled(
      [...this.refundListeners].map(async (listener) => listener(order)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `A refund listener failed for order ${order.orderNumber}: ${String(result.reason)}`,
        );
      }
    }
  }
}
