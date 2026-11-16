// test/support/in-memory-carts.repository.ts

import { randomUUID } from 'node:crypto';
import { CartsRepository } from '../../src/modules/cart/repositories/cart.repository.js';
import type {
  CartItemRecord,
  CartRecord,
} from '../../src/modules/cart/repositories/cart.repository.js';
import { userIdOfCart } from '../../src/common/utils/cart-identity.util.js';

/**
 * In-memory cart store — one document per owner (`cart:<userId>` or
 * `guest:<token>`), like the unique index on `carts.ownerId`.
 */
export class InMemoryCartsRepository implements CartsRepository {
  private readonly records = new Map<string, CartRecord>();

  async findByOwner(ownerId: string): Promise<CartRecord | null> {
    const record = this.records.get(ownerId);

    return record && !record.retiredAt ? clone(record) : null;
  }

  async retire(ownerId: string): Promise<void> {
    const record = this.records.get(ownerId);

    if (record) {
      this.records.set(ownerId, { ...record, retiredAt: new Date() });
    }
  }

  async save(
    ownerId: string,
    items: CartItemRecord[],
    couponCode: string | null,
  ): Promise<CartRecord> {
    const existing = this.records.get(ownerId);
    const record: CartRecord = {
      id: existing?.id ?? randomUUID(),
      ownerId,
      userId: userIdOfCart(ownerId),
      retiredAt: null,
      items: items.map((item) => ({ ...item })),
      couponCode,
      updatedAt: new Date(),
    };

    this.records.set(ownerId, record);

    return clone(record);
  }

  async setCoupon(ownerId: string, couponCode: string | null): Promise<void> {
    const existing = this.records.get(ownerId);

    if (!existing) {
      return;
    }

    this.records.set(ownerId, { ...existing, couponCode, updatedAt: new Date() });
  }

  async clear(ownerId: string): Promise<void> {
    this.records.delete(ownerId);
  }

  /** Fixture helper: plant a cart without going through the service. */
  seed(ownerId: string, items: CartItemRecord[], couponCode: string | null = null): CartRecord {
    const record: CartRecord = {
      id: randomUUID(),
      ownerId,
      userId: userIdOfCart(ownerId),
      retiredAt: null,
      items: items.map((item) => ({ ...item })),
      couponCode,
      updatedAt: new Date(),
    };

    this.records.set(ownerId, record);

    return clone(record);
  }

  reset(): void {
    this.records.clear();
  }
}

function clone(record: CartRecord): CartRecord {
  return { ...record, items: record.items.map((item) => ({ ...item })) };
}
