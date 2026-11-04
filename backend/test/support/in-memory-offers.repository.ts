import { randomBytes } from 'node:crypto';
import { offerStatus } from '../../src/modules/coupons/offer-status.js';
import { OffersRepository } from '../../src/modules/coupons/repositories/offers.repository.js';
import type {
  CreateOfferInput,
  OfferCountsRecord,
  OfferListFilter,
  OfferRecord,
  OfferUpdate,
  PublicOfferRecord,
} from '../../src/modules/coupons/repositories/offers.repository.js';

/**
 * In-memory offers repository.
 *
 * Mirrors `MongoOffersRepository` including the parts that make the feature safe:
 * the unique code rule, the derived-status filtering and the atomic usage claim
 * (a refused claim leaves both counters untouched). Tests can therefore exercise
 * limit races without a database.
 */
export class InMemoryOffersRepository implements OffersRepository {
  private readonly offers = new Map<string, OfferRecord>();
  private readonly customerCounters = new Map<string, number>();

  /** Fixture helper: inserts an offer directly (bypasses validation on purpose). */
  seed(overrides: Partial<OfferRecord> = {}): OfferRecord {
    const now = new Date();
    const offer: OfferRecord = {
      id: overrides.id ?? newObjectIdLike(),
      name: overrides.name ?? 'Test offer',
      description: overrides.description,
      code: overrides.code ?? `TEST${(this.offers.size + 1).toString().padStart(4, '0')}`,
      type: overrides.type ?? 'percentage',
      value: overrides.value ?? 10,
      minCartValue: overrides.minCartValue ?? 0,
      maxDiscount: overrides.maxDiscount ?? null,
      startsAt: overrides.startsAt ?? new Date(now.getTime() - 60_000),
      endsAt: overrides.endsAt ?? new Date(now.getTime() + 86_400_000),
      totalUsageLimit: overrides.totalUsageLimit ?? null,
      perCustomerLimit: overrides.perCustomerLimit ?? 1,
      applicableProductIds: overrides.applicableProductIds ?? [],
      applicableCategoryIds: overrides.applicableCategoryIds ?? [],
      excludedProductIds: overrides.excludedProductIds ?? [],
      excludedCategoryIds: overrides.excludedCategoryIds ?? [],
      customerVisible: overrides.customerVisible ?? true,
      isActive: overrides.isActive ?? true,
      usageCount: overrides.usageCount ?? 0,
      redeemedCount: overrides.redeemedCount ?? 0,
      createdBy: overrides.createdBy ?? null,
      updatedBy: overrides.updatedBy ?? null,
      history: overrides.history ?? [],
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
    };

    this.offers.set(offer.id, offer);

    return this.copy(offer);
  }

  async create(input: CreateOfferInput): Promise<OfferRecord | null> {
    if (this.findByCodeSync(input.code)) {
      return null;
    }

    const now = new Date();
    const offer: OfferRecord = {
      id: newObjectIdLike(),
      name: input.name,
      description: input.description,
      code: input.code.toUpperCase(),
      type: input.type,
      value: input.value,
      minCartValue: input.minCartValue,
      maxDiscount: input.maxDiscount,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      totalUsageLimit: input.totalUsageLimit,
      perCustomerLimit: input.perCustomerLimit,
      applicableProductIds: [...input.applicableProductIds],
      applicableCategoryIds: [...input.applicableCategoryIds],
      excludedProductIds: [...input.excludedProductIds],
      excludedCategoryIds: [...input.excludedCategoryIds],
      customerVisible: input.customerVisible,
      isActive: input.isActive,
      usageCount: 0,
      redeemedCount: 0,
      createdBy: input.createdBy,
      updatedBy: null,
      history: [...input.history],
      createdAt: now,
      updatedAt: now,
    };

    this.offers.set(offer.id, offer);

    return this.copy(offer);
  }

  async findById(id: string): Promise<OfferRecord | null> {
    const offer = this.offers.get(id);

    return offer ? this.copy(offer) : null;
  }

  async findByCode(code: string): Promise<OfferRecord | null> {
    const offer = this.findByCodeSync(code);

    return offer ? this.copy(offer) : null;
  }

  async list(
    filter: OfferListFilter,
  ): Promise<{ items: OfferRecord[]; total: number }> {
    const search = filter.search?.toLowerCase();

    const matches = [...this.offers.values()].filter((offer) => {
      if (filter.status && offerStatus(offer, filter.now) !== filter.status) {
        return false;
      }
      if (filter.type && offer.type !== filter.type) {
        return false;
      }
      if (filter.from && offer.endsAt.getTime() < filter.from.getTime()) {
        return false;
      }
      if (filter.to && offer.startsAt.getTime() > filter.to.getTime()) {
        return false;
      }
      if (search) {
        const haystack = `${offer.name} ${offer.code}`.toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });

    matches.sort((a, b) => {
      const direction = filter.sortOrder === 'asc' ? 1 : -1;

      switch (filter.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name) * direction;
        case 'startsAt':
          return (a.startsAt.getTime() - b.startsAt.getTime()) * direction;
        case 'endsAt':
          return (a.endsAt.getTime() - b.endsAt.getTime()) * direction;
        case 'usageCount':
          return (a.usageCount - b.usageCount) * direction;
        default:
          return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
      }
    });

    const start = (filter.page - 1) * filter.limit;

    return {
      items: matches.slice(start, start + filter.limit).map((offer) => this.copy(offer)),
      total: matches.length,
    };
  }

  async counts(now: Date): Promise<OfferCountsRecord> {
    const all = [...this.offers.values()];
    const count = (status: string) =>
      all.filter((offer) => offerStatus(offer, now) === status).length;

    return {
      totalOffers: all.length,
      activeOffers: count('active'),
      scheduledOffers: count('scheduled'),
      expiredOffers: count('expired'),
      exhaustedOffers: count('exhausted'),
      inactiveOffers: count('inactive'),
    };
  }

  async update(id: string, update: OfferUpdate): Promise<OfferRecord | null> {
    const offer = this.offers.get(id);

    if (!offer) {
      return null;
    }

    if (
      update.code &&
      this.findByCodeSync(update.code) &&
      this.findByCodeSync(update.code)?.id !== id
    ) {
      return null;
    }

    const next: OfferRecord = {
      ...offer,
      ...Object.fromEntries(
        Object.entries(update).filter(
          ([key, value]) => value !== undefined && key !== 'history',
        ),
      ),
      code: update.code ? update.code.toUpperCase() : offer.code,
      description:
        update.description === null ? undefined : (update.description ?? offer.description),
      history: update.history
        ? [...offer.history, ...update.history]
        : [...offer.history],
      updatedAt: new Date(),
    };

    this.offers.set(id, next);

    return this.copy(next);
  }

  async reserveUsage(
    id: string,
    input: { customerKey: string; now: Date },
  ): Promise<boolean> {
    const offer = this.offers.get(id);

    if (!offer) {
      return false;
    }
    if (offerStatus(offer, input.now) !== 'active') {
      return false;
    }

    const key = `${id}:${input.customerKey}`;
    const used = this.customerCounters.get(key) ?? 0;

    if (used >= offer.perCustomerLimit) {
      return false;
    }

    offer.usageCount += 1;
    this.customerCounters.set(key, used + 1);

    return true;
  }

  async releaseUsage(id: string, customerKey: string): Promise<void> {
    const offer = this.offers.get(id);

    if (offer && offer.usageCount > 0) {
      offer.usageCount -= 1;
    }

    const key = `${id}:${customerKey}`;
    const used = this.customerCounters.get(key) ?? 0;

    this.customerCounters.set(key, Math.max(0, used - 1));
  }

  async markRedeemed(id: string): Promise<void> {
    const offer = this.offers.get(id);

    if (offer) {
      offer.redeemedCount += 1;
    }
  }

  async unmarkRedeemed(id: string): Promise<void> {
    const offer = this.offers.get(id);

    if (offer && offer.redeemedCount > 0) {
      offer.redeemedCount -= 1;
    }
  }

  async customerUsage(id: string, customerKey: string): Promise<number> {
    return this.customerCounters.get(`${id}:${customerKey}`) ?? 0;
  }

  async listPublic(
    query: { search?: string; limit: number },
    now: Date,
  ): Promise<PublicOfferRecord[]> {
    const search = query.search?.trim().toLowerCase();

    return [...this.offers.values()]
      .filter((offer) => offerStatus(offer, now) === 'active' && offer.customerVisible)
      .filter((offer) =>
        search
          ? `${offer.name} ${offer.code} ${offer.description ?? ''}`
              .toLowerCase()
              .includes(search)
          : true,
      )
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())
      .slice(0, query.limit)
      .map((offer) => ({
        id: offer.id,
        name: offer.name,
        description: offer.description,
        code: offer.code,
        type: offer.type,
        value: offer.value,
        minCartValue: offer.minCartValue,
        maxDiscount: offer.maxDiscount,
        startsAt: offer.startsAt,
        endsAt: offer.endsAt,
        applicableProductIds: [...offer.applicableProductIds],
        applicableCategoryIds: [...offer.applicableCategoryIds],
      }));
  }

  reset(): void {
    this.offers.clear();
    this.customerCounters.clear();
  }

  all(): OfferRecord[] {
    return [...this.offers.values()].map((offer) => this.copy(offer));
  }

  private findByCodeSync(code: string): OfferRecord | null {
    const wanted = code.trim().toUpperCase();

    return (
      [...this.offers.values()].find((offer) => offer.code === wanted) ?? null
    );
  }

  private copy(offer: OfferRecord): OfferRecord {
    return {
      ...offer,
      applicableProductIds: [...offer.applicableProductIds],
      applicableCategoryIds: [...offer.applicableCategoryIds],
      excludedProductIds: [...offer.excludedProductIds],
      excludedCategoryIds: [...offer.excludedCategoryIds],
      createdBy: offer.createdBy ? { ...offer.createdBy } : null,
      updatedBy: offer.updatedBy ? { ...offer.updatedBy } : null,
      history: offer.history.map((entry) => ({ ...entry })),
    };
  }
}

function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}
