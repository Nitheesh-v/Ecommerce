import { randomBytes } from 'node:crypto';
import {
  isOpen,
  statusAfterRefunds,
  SETTLED_PAYMENT_STATUSES,
} from '../../src/modules/payments/payment-status.js';
import { PaymentsRepository } from '../../src/modules/payments/repositories/payments.repository.js';
import type {
  CreatePaymentInput,
  PaymentGuard,
  PaymentListFilter,
  PaymentRecord,
  PaymentSummaryRecord,
  PaymentUpdate,
} from '../../src/modules/payments/repositories/payments.repository.js';

/**
 * In-memory payments repository.
 *
 * Mirrors `MongoPaymentsRepository`: same optimistic status guards, same search
 * fields, same summary grouping — so an e2e test that passes here would pass
 * against Mongo.
 */
export class InMemoryPaymentsRepository implements PaymentsRepository {
  private readonly payments = new Map<string, PaymentRecord>();
  private sequence = 0;

  /** Test fixture helper: stores a payment as if the gateway had created it. */
  seed(overrides: Partial<PaymentRecord> & { orderId: string }): PaymentRecord {
    const now = new Date();
    const payment: PaymentRecord = {
      id: overrides.id ?? newObjectIdLike(),
      orderId: overrides.orderId,
      orderNumber: overrides.orderNumber ?? `ORD-TEST-${(++this.sequence).toString().padStart(4, '0')}`,
      userId: overrides.userId ?? null,
      customerEmail: overrides.customerEmail ?? 'customer@example.com',
      customerName: overrides.customerName ?? 'Test Customer',
      amount: overrides.amount ?? 100_000,
      currency: overrides.currency ?? 'INR',
      provider: overrides.provider ?? 'razorpay',
      method: overrides.method ?? 'card',
      status: overrides.status ?? 'pending',
      gatewayStatus: overrides.gatewayStatus,
      gatewayOrderId: overrides.gatewayOrderId,
      gatewayPaymentId: overrides.gatewayPaymentId,
      signatureVerified: overrides.signatureVerified ?? false,
      verifiedWithGateway: overrides.verifiedWithGateway ?? false,
      failureReason: overrides.failureReason,
      capturedAt: overrides.capturedAt,
      failedAt: overrides.failedAt,
      cancelledAt: overrides.cancelledAt,
      refundedAmount: overrides.refundedAmount ?? 0,
      pendingRefundAmount: overrides.pendingRefundAmount ?? 0,
      latestEvent: overrides.latestEvent,
      lastEventAt: overrides.lastEventAt,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
    };

    this.payments.set(payment.id, payment);

    return { ...payment };
  }

  async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    return this.seed(input);
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    const payment = this.payments.get(id);

    return payment ? { ...payment } : null;
  }

  async findByGatewayOrderId(gatewayOrderId: string): Promise<PaymentRecord | null> {
    const payment = [...this.payments.values()].find(
      (entry) => entry.gatewayOrderId === gatewayOrderId,
    );

    return payment ? { ...payment } : null;
  }

  async findByGatewayPaymentId(gatewayPaymentId: string): Promise<PaymentRecord | null> {
    const payment = [...this.payments.values()].find(
      (entry) => entry.gatewayPaymentId === gatewayPaymentId,
    );

    return payment ? { ...payment } : null;
  }

  async findOpenForOrder(orderId: string): Promise<PaymentRecord | null> {
    return this.latest(orderId, (entry) => isOpen(entry.status));
  }

  async findSettledForOrder(orderId: string): Promise<PaymentRecord | null> {
    return this.latest(orderId, (entry) => SETTLED_PAYMENT_STATUSES.includes(entry.status));
  }

  async list(
    filter: PaymentListFilter,
  ): Promise<{ items: PaymentRecord[]; total: number }> {
    const search = filter.search?.trim().toLowerCase();

    const items = [...this.payments.values()]
      .filter((payment) => {
        if (filter.status && payment.status !== filter.status) {
          return false;
        }
        if (filter.method && payment.method !== filter.method) {
          return false;
        }
        if (filter.from && payment.createdAt < filter.from) {
          return false;
        }
        if (filter.to && payment.createdAt > filter.to) {
          return false;
        }
        if (search) {
          const haystack = [
            payment.id,
            payment.orderId,
            payment.orderNumber,
            payment.customerName,
            payment.customerEmail,
            payment.gatewayOrderId,
            payment.gatewayPaymentId,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(search);
        }

        return true;
      })
      .sort((a, b) => {
        const direction = filter.sortOrder === 'asc' ? 1 : -1;

        if (filter.sortBy === 'amount') {
          return (a.amount - b.amount) * direction;
        }

        return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
      });

    const start = (filter.page - 1) * filter.limit;

    return {
      items: items.slice(start, start + filter.limit).map((payment) => ({ ...payment })),
      total: items.length,
    };
  }

  async summary(): Promise<PaymentSummaryRecord> {
    const all = [...this.payments.values()];
    const sum = (rows: PaymentRecord[], pick: (row: PaymentRecord) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);
    const successful = all.filter((row) => SETTLED_PAYMENT_STATUSES.includes(row.status));
    const pending = all.filter((row) => isOpen(row.status));
    const failed = all.filter((row) => row.status === 'failed' || row.status === 'cancelled');

    return {
      totalCount: all.length,
      totalAmount: sum(all, (row) => row.amount),
      successfulCount: successful.length,
      successfulAmount: sum(successful, (row) => row.amount),
      pendingCount: pending.length,
      pendingAmount: sum(pending, (row) => row.amount),
      failedCount: failed.length,
      failedAmount: sum(failed, (row) => row.amount),
      refundedAmount: sum(all, (row) => row.refundedAmount),
      currency: 'INR',
    };
  }

  async update(
    id: string,
    guard: PaymentGuard,
    update: PaymentUpdate,
  ): Promise<PaymentRecord | null> {
    const existing = this.payments.get(id);

    if (!existing) {
      return null;
    }
    if (guard.status?.length && !guard.status.includes(existing.status)) {
      return null;
    }

    const next: PaymentRecord = { ...existing, updatedAt: new Date() };

    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) {
        continue;
      }

      (next as unknown as Record<string, unknown>)[key] = value;
    }

    this.payments.set(id, next);

    return { ...next };
  }

  /** Test hook: mirrors the order's refund ledger, as the listener would. */
  syncFromOrder(
    orderId: string,
    processed: number,
    pending: number,
  ): void {
    const payment = [...this.payments.values()].find(
      (entry) => entry.orderId === orderId && SETTLED_PAYMENT_STATUSES.includes(entry.status),
    );

    if (!payment) {
      return;
    }

    payment.refundedAmount = processed;
    payment.pendingRefundAmount = pending;
    payment.status = statusAfterRefunds(payment.status, payment.amount, processed);
  }

  reset(): void {
    this.payments.clear();
    this.sequence = 0;
  }

  all(): PaymentRecord[] {
    return [...this.payments.values()].map((payment) => ({ ...payment }));
  }

  private latest(
    orderId: string,
    predicate: (payment: PaymentRecord) => boolean,
  ): PaymentRecord | null {
    const matches = [...this.payments.values()]
      .filter((entry) => entry.orderId === orderId && predicate(entry))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return matches[0] ? { ...matches[0] } : null;
  }
}

function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}
