// src/modules/inventory/inventory.notifier.ts
import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AlertLevel } from './schemas/inventory-alert.schema.js';

/** Minimal alert payload handed to notification integrations. */
export interface InventoryAlertNotice {
  productId: string;
  productName: string;
  sku: string;
  level: AlertLevel;
  quantity: number;
  lowStockThreshold: number;
}

/**
 * Notification seam for stock alerts.
 *
 * Alerts are **persisted first** (`inventory_alerts`), then handed to this
 * notifier. That ordering is deliberate: if email is down, the alert is still
 * visible in the admin console and can be replayed later.
 *
 * Since phase 18 the seam writes a real notification instead of a log line: the
 * alert lands in the operator feed at `/admin/notifications`, and is emailed to the
 * store's support address when SMTP is configured. `notify()` never throws, so a
 * dead mail server cannot fail a stock adjustment.
 */
@Injectable()
export class InventoryNotifier {
  private readonly logger = new Logger('InventoryAlerts');

  constructor(private readonly notifications: NotificationsService) {}

  /** A product just entered `low` or `out` of stock (deduplicated upstream). */
  async alertOpened(alert: InventoryAlertNotice): Promise<void> {
    this.logger.warn(
      `[${alert.level === 'out' ? 'OUT OF STOCK' : 'LOW STOCK'}] ${alert.productName} ` +
        `(${alert.sku}) — ${alert.quantity} left, threshold ${alert.lowStockThreshold}`,
    );

    await this.notifications.notifyAdmins({
      type: alert.level === 'out' ? 'inventory_out' : 'inventory_low',
      data: {
        productId: alert.productId,
        productName: alert.productName,
        sku: alert.sku,
        quantity: alert.quantity,
        lowStockThreshold: alert.lowStockThreshold,
      },
      // Operators asked to hear about stock, so this one is emailed as well.
      email: true,
      // One message per product per level: a hundred movements must not send a
      // hundred emails about the same shortage.
      dedupeKey: `inventory:${alert.productId}:${alert.level}`,
    });
  }

  /** Stock recovered above the threshold. */
  async alertResolved(alert: InventoryAlertNotice): Promise<void> {
    this.logger.log(
      `[RESOLVED] ${alert.productName} (${alert.sku}) is back above its threshold`,
    );
  }
}
