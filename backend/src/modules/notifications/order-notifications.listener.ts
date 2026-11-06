// src/modules/notifications/order-notifications.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderEvents } from '../orders/order-events.js';
import type { OrderRecord } from '../orders/repositories/orders.repository.js';
import type { PaymentMethod } from '../orders/schemas/order.schema.js';
import { NotificationsService } from './notifications.service.js';
import type { NotificationData, NotificationType } from './schemas/notification.schema.js';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  card: 'Card',
  upi: 'UPI',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  manual: 'Manual payment',
};

/**
 * Order lifecycle → notifications.
 *
 * It listens on `OrderEvents` instead of being called from `OrdersService`, which
 * keeps the direction of the dependency one-way: orders knows nothing about
 * notifications, and the bus already guarantees that a failing listener is logged
 * rather than allowed to fail an order write. (The same seam feeds the payments
 * module's refund mirror.)
 *
 * Status changes are mapped explicitly: `processing` and the return workflow are
 * *not* customer messages. Silence is better than "your order is processing" five
 * times.
 */
@Injectable()
export class OrderNotificationsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderNotificationsListener.name);
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly events: OrderEvents,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribers = [
      this.events.onOrderPlaced((order) => this.onPlaced(order)),
      this.events.onStatusChanged((order) => this.onStatusChanged(order)),
      this.events.onRefundChanged((order) => this.onRefundChanged(order)),
    ];
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  private async onPlaced(order: OrderRecord): Promise<void> {
    const data = this.baseData(order, {
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      paymentMethod: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
    });

    await this.notifications.notify({
      type: 'order_placed',
      audience: 'customer',
      userId: order.userId,
      recipientEmail: order.customerEmail,
      recipientName: order.customerName,
      data,
      dedupeKey: `order_placed:${order.id}`,
    });

    // In-app only: an operator already sees new orders in the console, and one
    // email per order is noise, not vigilance.
    await this.notifications.notifyAdmins({
      type: 'order_placed',
      data,
      dedupeKey: `order_placed_admin:${order.id}`,
    });
  }

  private async onStatusChanged(order: OrderRecord): Promise<void> {
    const type = this.statusType(order.status);

    if (!type) {
      return;
    }

    const data = this.baseData(order, {
      paymentMethod: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
      reason: order.cancellation?.reason ?? '',
      courier: order.shipping?.provider ?? '',
      trackingNumber: order.shipping?.trackingNumber ?? '',
      estimatedDelivery: order.shipping?.estimatedDelivery
        ? order.shipping.estimatedDelivery.toISOString()
        : '',
    });

    await this.notifications.notify({
      type,
      audience: 'customer',
      userId: order.userId,
      recipientEmail: order.customerEmail,
      recipientName: order.customerName,
      data,
      dedupeKey: `${type}:${order.id}`,
    });

    if (order.status === 'cancelled') {
      await this.notifications.notifyAdmins({
        type: 'order_cancelled',
        data,
        dedupeKey: `order_cancelled_admin:${order.id}`,
      });
    }
  }

  private async onRefundChanged(order: OrderRecord): Promise<void> {
    const processed = order.payment.refunds.filter((refund) => refund.status === 'processed');

    if (processed.length === 0) {
      return;
    }

    const amount = processed.reduce((sum, refund) => sum + refund.amount, 0);
    const latest = processed[processed.length - 1];

    await this.notifications.notify({
      type: 'refund_processed',
      audience: 'customer',
      userId: order.userId,
      recipientEmail: order.customerEmail,
      recipientName: order.customerName,
      data: this.baseData(order, {
        amount,
        reference: latest.reference ?? latest.gatewayRefundId ?? '',
      }),
      // Keyed on the refunded total: a second, larger refund is a new message.
      dedupeKey: `refund_processed:${order.id}:${amount}`,
    });
  }

  /** The fulfilment states a customer is actually told about. */
  private statusType(status: OrderRecord['status']): NotificationType | null {
    switch (status) {
      case 'confirmed':
        return 'order_confirmed';
      case 'shipped':
        return 'order_shipped';
      case 'out_for_delivery':
        return 'order_out_for_delivery';
      case 'delivered':
        return 'order_delivered';
      case 'cancelled':
        return 'order_cancelled';
      default:
        return null;
    }
  }

  private baseData(
    order: OrderRecord,
    extra: NotificationData = {},
  ): NotificationData {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      customerName: order.customerName,
      ...extra,
    };
  }
}
