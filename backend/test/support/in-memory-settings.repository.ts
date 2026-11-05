import { SettingsRepository } from '../../src/modules/settings/repositories/settings.repository.js';
import type {
  SettingsActor,
  StoreSettingsPatch,
  StoreSettingsRecord,
} from '../../src/modules/settings/repositories/settings.repository.js';

/**
 * In-memory settings store.
 *
 * Starts empty, exactly like a fresh database: the first read makes the service
 * seed the row from the environment defaults, which is itself worth testing.
 */
export class InMemorySettingsRepository implements SettingsRepository {
  private record: StoreSettingsRecord | null = null;
  private footprint = { orders: 0, products: 0 };

  /** Fixture helper: pretend the store already holds data (currency lock). */
  setFootprint(footprint: { orders: number; products: number }): void {
    this.footprint = footprint;
  }

  async find(): Promise<StoreSettingsRecord | null> {
    return this.record ? { ...this.record, address: { ...this.record.address } } : null;
  }

  async create(input: StoreSettingsRecord): Promise<StoreSettingsRecord> {
    this.record = {
      ...input,
      address: { ...input.address },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return { ...this.record, address: { ...this.record.address } };
  }

  async update(
    patch: StoreSettingsPatch,
    actor: SettingsActor,
  ): Promise<StoreSettingsRecord | null> {
    if (!this.record) {
      return null;
    }

    this.record = {
      ...this.record,
      ...patch,
      address: patch.address ? { ...patch.address } : this.record.address,
      updatedBy: { userId: actor.userId ?? undefined, email: actor.email },
      updatedAt: new Date(),
    };

    return { ...this.record, address: { ...this.record.address } };
  }

  async dataFootprint(): Promise<{ orders: number; products: number }> {
    return { ...this.footprint };
  }

  reset(): void {
    this.record = null;
    this.footprint = { orders: 0, products: 0 };
  }
}
