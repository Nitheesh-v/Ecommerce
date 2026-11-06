// test/support/in-memory-carts.repository.ts

import { randomUUID } from 'node:crypto';
import { CartsRepository } from '../../src/modules/cart/repositories/cart.repository.js';
import type {
  CartItemRecord,
  CartRecord,
} from '../../src/modules/cart/repositories/cart.repository.js';

/**
 * In-memory cart store — one document per customer, like the unique index on
 * `carts.userId`.
 */
export class InMemoryCartsRepository implements CartsRepository {
  private readonly records = new Map<string, CartRecord>();

  async findByUser(userId: string): Promise<CartRecord | null> {
    const record = this.records.get(userId);

    return record ? clone(record) : null;
  }

  async save(
    userId: string,
    items: CartItemRecord[],
    couponCode: string | null,
  ): Promise<CartRecord> {
    const existing = this.records.get(userId);
    const record: CartRecord = {
      id: existing?.id ?? randomUUID(),
      userId,
      items: items.map((item) => ({ ...item })),
      couponCode,
      updatedAt: new Date(),
    };

    this.records.set(userId, record);

    return clone(record);
  }

  async setCoupon(userId: string, couponCode: string | null): Promise<void> {
    const existing = this.records.get(userId);

    if (!existing) {
      return;
    }

    this.records.set(userId, { ...existing, couponCode, updatedAt: new Date() });
  }

  async clear(userId: string): Promise<void> {
    this.records.delete(userId);
  }

  /** Fixture helper: plant a cart without going through the service. */
  seed(userId: string, items: CartItemRecord[], couponCode: string | null = null): CartRecord {
    const record: CartRecord = {
      id: randomUUID(),
      userId,
      items: items.map((item) => ({ ...item })),
      couponCode,
      updatedAt: new Date(),
    };

    this.records.set(userId, record);

    return clone(record);
  }

  reset(): void {
    this.records.clear();
  }
}

function clone(record: CartRecord): CartRecord {
  return { ...record, items: record.items.map((item) => ({ ...item })) };
}
