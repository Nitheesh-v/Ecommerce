// test/support/in-memory-addresses.repository.ts

import { randomBytes } from 'node:crypto';
import { AddressesRepository } from '../../src/modules/addresses/repositories/addresses.repository.js';
import type {
  AddressRecord,
  CreateAddressInput,
  UpdateAddressInput,
} from '../../src/modules/addresses/repositories/addresses.repository.js';

/**
 * In-memory address book.
 *
 * Mirrors the Mongo repository's contract exactly — including the part that matters
 * most: `findOwned`/`update`/`remove` are scoped by owner, so another customer's id
 * behaves like a missing one. If this file and the Mongo one ever disagree, the e2e
 * suite is testing fiction.
 */
/** 24 hex characters, the shape `@IsMongoId()` accepts on the checkout DTOs. */
function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}

export class InMemoryAddressesRepository implements AddressesRepository {
  private readonly records = new Map<string, AddressRecord>();

  async list(userId: string): Promise<AddressRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) {
          return a.isDefault ? -1 : 1;
        }

        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .map((record) => ({ ...record }));
  }

  async countFor(userId: string): Promise<number> {
    return [...this.records.values()].filter((record) => record.userId === userId).length;
  }

  async findOwned(id: string, userId: string): Promise<AddressRecord | null> {
    const record = this.records.get(id);

    return record && record.userId === userId ? { ...record } : null;
  }

  async create(input: CreateAddressInput): Promise<AddressRecord> {
    const now = new Date();
    const record: AddressRecord = {
      id: newObjectIdLike(),
      userId: input.userId,
      label: input.label,
      recipientName: input.recipientName,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      isDefault: input.isDefault,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.id, record);

    return { ...record };
  }

  async update(
    id: string,
    userId: string,
    input: UpdateAddressInput,
  ): Promise<AddressRecord | null> {
    const record = this.records.get(id);

    if (!record || record.userId !== userId) {
      return null;
    }

    const updated: AddressRecord = {
      ...record,
      ...input,
      userId: record.userId,
      createdAt: record.createdAt,
      updatedAt: new Date(),
    };

    this.records.set(id, updated);

    return { ...updated };
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const record = this.records.get(id);

    if (!record || record.userId !== userId) {
      return false;
    }

    this.records.delete(id);

    return true;
  }

  async clearDefault(userId: string, exceptId?: string): Promise<void> {
    for (const record of this.records.values()) {
      if (record.userId === userId && record.id !== exceptId && record.isDefault) {
        this.records.set(record.id, { ...record, isDefault: false });
      }
    }
  }

  /** Fixture helper: plant an address as if it had been saved earlier. */
  seed(record: Partial<AddressRecord> & { userId: string }): AddressRecord {
    const now = new Date();
    const planted: AddressRecord = {
      id: record.id ?? newObjectIdLike(),
      userId: record.userId,
      label: record.label ?? 'Home',
      recipientName: record.recipientName ?? 'Asha Rao',
      phone: record.phone ?? '+91 98765 43210',
      line1: record.line1 ?? '12 Market Road',
      line2: record.line2 ?? null,
      city: record.city ?? 'Coimbatore',
      state: record.state ?? 'Tamil Nadu',
      postalCode: record.postalCode ?? '641001',
      country: record.country ?? 'India',
      isDefault: record.isDefault ?? true,
      createdAt: record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now,
    };

    this.records.set(planted.id, planted);

    return { ...planted };
  }

  reset(): void {
    this.records.clear();
  }
}
