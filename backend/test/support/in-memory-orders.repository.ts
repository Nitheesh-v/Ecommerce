import { randomBytes } from 'node:crypto';
import {
  OrdersRepository,
  type CreateOrderInput,
  type HistoryRecord,
  type OrderListFilter,
  type OrderRecord,
  type OrderUpdate,
  type ReturnRecord,
} from '../../src/modules/orders/repositories/orders.repository.js';
import type { OrderStatus } from '../../src/modules/orders/schemas/order.schema.js';

/**
 * In-memory orders repository.
 *
 * Mirrors `MongooseOrdersRepository` closely enough to exercise the service and
 * the HTTP contract without a database: same optimistic guards, same append-only
 * history, same per-day order numbering.
 */
export class InMemoryOrdersRepository implements OrdersRepository {
  private readonly orders = new Map<string, OrderRecord>();
  private sequence = 0;

  /** Test fixture helper: stores an order as if it had been placed already. */
  seed(overrides: Partial<OrderRecord> & { id?: string }): OrderRecord {
    const now = new Date();
    const id = overrides.id ?? newObjectIdLike();
    const order: OrderRecord = {
      id,
      orderNumber: overrides.orderNumber ?? `ORD-20260101-${(++this.sequence).toString().padStart(4, '0')}`,
      userId: overrides.userId ?? null,
      customerName: overrides.customerName ?? 'Test Customer',
      customerEmail: overrides.customerEmail ?? 'customer@example.com',
      customerPhone: overrides.customerPhone ?? '+91 90000 00000',
      items: overrides.items ?? [],
      subtotal: overrides.subtotal ?? 0,
      discountTotal: overrides.discountTotal ?? 0,
      couponDiscount: overrides.couponDiscount ?? 0,
      shippingCharge: overrides.shippingCharge ?? 0,
      taxAmount: overrides.taxAmount ?? 0,
      taxRatePercent: overrides.taxRatePercent ?? 0,
      total: overrides.total ?? 0,
      currency: overrides.currency ?? 'INR',
      shippingAddress:
        overrides.shippingAddress ?? {
          recipientName: 'Test Customer',
          phone: '+91 90000 00000',
          line1: '1 Test Street',
          city: 'Coimbatore',
          state: 'Tamil Nadu',
          postalCode: '641001',
          country: 'India',
        },
      shippingMethod: overrides.shippingMethod ?? 'standard',
      shipping: overrides.shipping ?? { notes: [] },
      payment: overrides.payment ?? {
        method: 'cod',
        paidAmount: 0,
        refunds: [],
      },
      paymentMethod: overrides.paymentMethod ?? 'cod',
      paymentStatus: overrides.paymentStatus ?? 'pending',
      status: overrides.status ?? 'pending',
      returns: overrides.returns ?? [],
      history: overrides.history ?? [],
      idempotencyKey: overrides.idempotencyKey,
      closedAt: overrides.closedAt ?? null,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
    };

    this.orders.set(order.id, order);

    return { ...order };
  }

  async nextOrderNumber(now = new Date()): Promise<string> {
    const day = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('');

    this.sequence += 1;

    return `ORD-${day}-${String(this.sequence).padStart(4, '0')}`;
  }

  async create(input: CreateOrderInput): Promise<OrderRecord | null> {
    if (input.idempotencyKey && (await this.findByIdempotencyKey(input.idempotencyKey))) {
      return null;
    }

    const now = new Date();
    const order: OrderRecord = {
      ...input,
      id: newObjectIdLike(),
      // Mirrors the schema's denormalised field.
      paymentMethod: input.payment.method,
      payment: { ...input.payment, refunds: [] },
      items: input.items.map((item) => ({ ...item, imageUrl: item.imageUrl ?? null })),
      shipping: { notes: [] },
      returns: [],
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);

    return { ...order };
  }

  async findById(id: string): Promise<OrderRecord | null> {
    const order = this.orders.get(id);

    return order ? { ...order } : null;
  }

  async findByIdempotencyKey(key: string): Promise<OrderRecord | null> {
    const order = [...this.orders.values()].find((entry) => entry.idempotencyKey === key);

    return order ? { ...order } : null;
  }

  async list(
    filter: OrderListFilter,
  ): Promise<{ items: OrderRecord[]; total: number }> {
    const search = filter.search?.trim().toLowerCase();

    let items = [...this.orders.values()].filter((order) => {
      if (filter.userId && order.userId !== filter.userId) {
        return false;
      }
      if (filter.status && order.status !== filter.status) {
        return false;
      }
      if (filter.paymentStatus && order.paymentStatus !== filter.paymentStatus) {
        return false;
      }
      if (filter.paymentMethod && order.paymentMethod !== filter.paymentMethod) {
        return false;
      }
      if (filter.from && order.createdAt < filter.from) {
        return false;
      }
      if (filter.to && order.createdAt > filter.to) {
        return false;
      }
      if (search) {
        const haystack = `${order.orderNumber} ${order.customerName} ${order.customerEmail} ${order.shippingAddress.phone}`;
        return haystack.toLowerCase().includes(search);
      }

      return true;
    });

    items = items.sort((a, b) => {
      const direction = filter.sortOrder === 'asc' ? 1 : -1;

      if (filter.sortBy === 'total') {
        return (a.total - b.total) * direction;
      }

      return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
    });

    const start = (filter.page - 1) * filter.limit;

    return {
      items: items.slice(start, start + filter.limit).map((order) => ({ ...order })),
      total: items.length,
    };
  }

  async apply(
    id: string,
    guard: { status?: OrderStatus[]; returnId?: string },
    update: OrderUpdate,
  ): Promise<OrderRecord | null> {
    const existing = this.orders.get(id);

    if (!existing) {
      return null;
    }
    if (guard.status?.length && !guard.status.includes(existing.status)) {
      return null;
    }
    if (guard.returnId && !existing.returns.some((entry) => entry.returnId === guard.returnId)) {
      return null;
    }

    const next: OrderRecord = {
      ...existing,
      payment: { ...existing.payment, refunds: [...existing.payment.refunds] },
      returns: [...existing.returns],
      history: [...existing.history],
      updatedAt: new Date(),
    };

    for (const [key, value] of Object.entries(update.set ?? {})) {
      if (value === undefined) {
        continue;
      }
      setPath(next as unknown as Record<string, unknown>, key, value);
    }

    if (update.pushHistory?.length) {
      next.history.push(...update.pushHistory.map(copyHistory));
    }
    if (update.pushReturn) {
      next.returns.push(copyReturn(update.pushReturn));
    }

    this.orders.set(id, next);

    return { ...next };
  }

  /** Test hook: empties the store (specs reseed per test). */
  reset(): void {
    this.orders.clear();
    this.sequence = 0;
  }

  all(): OrderRecord[] {
    return [...this.orders.values()].map((order) => ({ ...order }));
  }
}

function copyHistory(entry: HistoryRecord): HistoryRecord {
  return { ...entry, by: entry.by ? { ...entry.by } : null };
}

function copyReturn(entry: ReturnRecord): ReturnRecord {
  return {
    ...entry,
    items: entry.items.map((item) => ({ ...item })),
    requestedBy: entry.requestedBy ?? null,
    decidedBy: entry.decidedBy ?? null,
  };
}

/** Supports `'shipping.shippedAt'`-style paths used by status transitions. */
function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = target;

  for (const segment of segments.slice(0, -1)) {
    const child = cursor[segment];

    if (!child || typeof child !== 'object') {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[segments.at(-1)!] = value;
}

function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}
