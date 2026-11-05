import { BadRequestException, ConflictException } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { SettingsRepository } from './repositories/settings.repository.js';
import type {
  SettingsActor,
  StoreSettingsPatch,
  StoreSettingsRecord,
} from './repositories/settings.repository.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { Role } from '../../common/enums/role.enum.js';

class FakeSettingsRepository implements SettingsRepository {
  record: StoreSettingsRecord | null = null;
  footprint = { orders: 0, products: 0 };
  finds = 0;
  creates = 0;
  updates = 0;

  async find(): Promise<StoreSettingsRecord | null> {
    this.finds += 1;

    return this.record;
  }

  async create(input: StoreSettingsRecord): Promise<StoreSettingsRecord> {
    this.creates += 1;
    this.record = { ...input, address: { ...input.address } };

    return this.record;
  }

  async update(
    patch: StoreSettingsPatch,
    actor: SettingsActor,
  ): Promise<StoreSettingsRecord | null> {
    this.updates += 1;

    if (!this.record) {
      return null;
    }

    this.record = {
      ...this.record,
      ...patch,
      address: patch.address ? { ...patch.address } : this.record.address,
      updatedBy: { userId: actor.userId, email: actor.email },
      updatedAt: new Date('2026-11-05T10:00:00.000Z'),
    };

    return this.record;
  }

  async dataFootprint(): Promise<{ orders: number; products: number }> {
    return this.footprint;
  }
}

const ACTOR: AuthenticatedUser = {
  id: '5f1d7a9b8c1e2d3f4a5b6c7d',
  email: 'owner@example.com',
  role: Role.Admin,
};

describe('SettingsService', () => {
  let repository: FakeSettingsRepository;
  let service: SettingsService;

  beforeEach(() => {
    repository = new FakeSettingsRepository();
    service = new SettingsService(repository);
  });

  it('seeds the document from the environment on first read, exactly once', async () => {
    const settings = await service.get();

    expect(settings.currency).toBe('INR');
    expect(settings.taxRatePercent).toBe(0);
    expect(settings.flatShippingCharge).toBe(4_900);
    expect(settings.freeShippingThreshold).toBe(99_900);
    expect(settings.codEnabled).toBe(true);
    expect(repository.creates).toBe(1);

    await service.get();
    await service.get();

    // Cached: checkout must not read the settings document per request.
    expect(repository.creates).toBe(1);
    expect(repository.finds).toBe(1);
  });

  it('prices from the stored settings, not from the environment', async () => {
    await service.update(
      { taxRatePercent: 12, flatShippingCharge: 7_000, freeShippingThreshold: 199_900 },
      ACTOR,
    );

    await expect(service.pricing()).resolves.toEqual({
      currency: 'INR',
      taxRatePercent: 12,
      flatShippingCharge: 7_000,
      freeShippingThreshold: 199_900,
    });
  });

  it('reports the COD switch the way checkout will read it', async () => {
    await expect(service.codEnabled()).resolves.toBe(true);

    await service.update({ codEnabled: false }, ACTOR);

    await expect(service.codEnabled()).resolves.toBe(false);
  });

  it('normalises currency and records the actor', async () => {
    const view = await service.update({ currency: 'usd' }, ACTOR);

    expect(view.currency).toBe('USD');
    expect(view.updatedBy).toBe(ACTOR.email);
    expect(view.currencyLocked).toBe(false);
  });

  it('refuses a currency change once the store holds products or orders', async () => {
    repository.footprint = { orders: 3, products: 0 };

    await expect(service.update({ currency: 'EUR' }, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );

    // The refusal leaves the stored currency alone.
    await expect(service.pricing()).resolves.toMatchObject({ currency: 'INR' });
  });

  it('keeps other edits working while the currency is locked', async () => {
    repository.footprint = { orders: 3, products: 4 };

    const view = await service.update({ taxRatePercent: 18 }, ACTOR);

    expect(view.taxRatePercent).toBe(18);
    expect(view.currencyLocked).toBe(true);
  });

  it('rejects a merged document that would leave the store invalid', async () => {
    await expect(
      service.update({ address: { postalCode: 'ABC' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.update({ taxRatePercent: 140 }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('clears optional text when a field is emptied', async () => {
    await service.update({ invoiceFooter: 'Thanks!' }, ACTOR);

    const view = await service.update({ invoiceFooter: '   ' }, ACTOR);

    expect(view.invoiceFooter).toBeNull();
  });

  it('reloads after invalidation', async () => {
    await service.get();
    service.invalidate();
    await service.get();

    expect(repository.finds).toBe(2);
    expect(repository.creates).toBe(1);
  });

  it('publishes only the storefront-safe fields', async () => {
    const view = await service.publicView();

    expect(view).not.toHaveProperty('taxRatePercent');
    expect(view).not.toHaveProperty('flatShippingCharge');
    expect(view).not.toHaveProperty('updatedBy');
    expect(view.storeName).toBe('Ecommerce26');
  });
});
