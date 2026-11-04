import { Injectable, Logger } from '@nestjs/common';
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
 * notifier. That ordering is deliberate: if email/Slack is down, the alert is
 * still visible in the admin console and can be replayed later. A future
 * integration only has to replace this provider — no inventory logic changes.
 *
 * The default implementation logs. Swap it (or extend it) with a mailer,
 * Slack webhook or a queue producer in `InventoryModule`.
 */
@Injectable()
export class InventoryNotifier {
  private readonly logger = new Logger('InventoryAlerts');

  /** A product just entered `low` or `out` of stock (deduplicated upstream). */
  async alertOpened(alert: InventoryAlertNotice): Promise<void> {
    this.logger.warn(
      `[${alert.level === 'out' ? 'OUT OF STOCK' : 'LOW STOCK'}] ${alert.productName} ` +
        `(${alert.sku}) — ${alert.quantity} left, threshold ${alert.lowStockThreshold}`,
    );
  }

  /** Stock recovered above the threshold. */
  async alertResolved(alert: InventoryAlertNotice): Promise<void> {
    this.logger.log(
      `[RESOLVED] ${alert.productName} (${alert.sku}) is back above its threshold`,
    );
  }
}
