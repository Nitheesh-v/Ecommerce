import { RedemptionsRepository } from '../../src/modules/coupons/repositories/offers.repository.js';
import type {
  CreateRedemptionInput,
  RedemptionListFilter,
  RedemptionRecord,
  RedemptionSummaryRecord,
} from '../../src/modules/coupons/repositories/offers.repository.js';
import type { RedemptionStatus } from '../../src/modules/coupons/schemas/offer.schema.js';

/**
 * In-memory redemption ledger.
 *
 * Mirrors the Mongo repository's guards: a redemption id is unique, an (offer,
 * order) pair can only be attached once, `confirm` only moves `reserved → redeemed`
 * and `reverse` only closes a live redemption — which is what makes replays and
 * webhook-style retries safe.
 */
export class InMemoryRedemptionsRepository implements RedemptionsRepository {
  private readonly redemptions = new Map<string, RedemptionRecord>();

  /** Fixture helper: records a redemption as if checkout had created it. */
  seed(
    overrides: Partial<RedemptionRecord> & { offerId: string; code: string },
  ): RedemptionRecord {
    const now = new Date();
    const redemption: RedemptionRecord = {
      redemptionId: overrides.redemptionId ?? `red-${this.redemptions.size + 1}`,
      offerId: overrides.offerId,
      code: overrides.code.toUpperCase(),
      type: overrides.type ?? 'percentage',
      value: overrides.value ?? 10,
      orderId: overrides.orderId ?? null,
      orderNumber: overrides.orderNumber ?? null,
      userId: overrides.userId ?? null,
      customerEmail: overrides.customerEmail ?? 'customer@example.com',
      discountAmount: overrides.discountAmount ?? 0,
      freeShipping: overrides.freeShipping ?? false,
      status: overrides.status ?? 'reserved',
      reservedAt: overrides.reservedAt ?? now,
      redeemedAt: overrides.redeemedAt ?? null,
      reversedAt: overrides.reversedAt ?? null,
      reversalReason: overrides.reversalReason ?? null,
    };

    this.redemptions.set(redemption.redemptionId, redemption);

    return { ...redemption };
  }

  async create(input: CreateRedemptionInput): Promise<RedemptionRecord | null> {
    if (this.redemptions.has(input.redemptionId)) {
      return null;
    }

    const redemption: RedemptionRecord = {
      ...input,
      customerEmail: input.customerEmail.toLowerCase(),
      orderId: null,
      orderNumber: null,
      status: 'reserved',
      redeemedAt: null,
      reversedAt: null,
      reversalReason: null,
    };

    this.redemptions.set(redemption.redemptionId, redemption);

    return { ...redemption };
  }

  async findById(redemptionId: string): Promise<RedemptionRecord | null> {
    const redemption = this.redemptions.get(redemptionId);

    return redemption ? { ...redemption } : null;
  }

  async attachOrder(
    redemptionId: string,
    order: { orderId: string; orderNumber: string },
  ): Promise<void> {
    const redemption = this.redemptions.get(redemptionId);

    if (!redemption || redemption.orderId !== null) {
      return;
    }

    // Mirrors the unique (offerId, orderId) index: one redemption per order.
    const existing = [...this.redemptions.values()].find(
      (entry) =>
        entry.offerId === redemption.offerId && entry.orderId === order.orderId,
    );

    if (existing) {
      return;
    }

    redemption.orderId = order.orderId;
    redemption.orderNumber = order.orderNumber;
  }

  async confirm(redemptionId: string, at: Date): Promise<boolean> {
    const redemption = this.redemptions.get(redemptionId);

    if (!redemption || redemption.status !== 'reserved') {
      return false;
    }

    redemption.status = 'redeemed';
    redemption.redeemedAt = at;

    return true;
  }

  async reverse(
    redemptionId: string,
    input: { at: Date; reason: string },
  ): Promise<RedemptionStatus | null> {
    const redemption = this.redemptions.get(redemptionId);

    if (
      !redemption ||
      (redemption.status !== 'reserved' && redemption.status !== 'redeemed')
    ) {
      return null;
    }

    const previous = redemption.status;

    redemption.status = 'reversed';
    redemption.reversedAt = input.at;
    redemption.reversalReason = input.reason;

    return previous;
  }

  async findByOrderId(orderId: string): Promise<RedemptionRecord | null> {
    const redemption = [...this.redemptions.values()].find(
      (entry) => entry.orderId === orderId,
    );

    return redemption ? { ...redemption } : null;
  }

  async list(
    filter: RedemptionListFilter,
  ): Promise<{ items: RedemptionRecord[]; total: number }> {
    const search = filter.search?.toLowerCase();

    const matches = [...this.redemptions.values()].filter((redemption) => {
      if (filter.status && redemption.status !== filter.status) {
        return false;
      }
      if (filter.offerId && redemption.offerId !== filter.offerId) {
        return false;
      }
      if (filter.from && redemption.reservedAt.getTime() < filter.from.getTime()) {
        return false;
      }
      if (filter.to && redemption.reservedAt.getTime() > filter.to.getTime()) {
        return false;
      }
      if (search) {
        const haystack = [
          redemption.code,
          redemption.orderNumber ?? '',
          redemption.customerEmail,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });

    matches.sort((a, b) => {
      const direction = filter.sortOrder === 'asc' ? 1 : -1;

      switch (filter.sortBy) {
        case 'discountAmount':
          return (a.discountAmount - b.discountAmount) * direction;
        case 'redeemedAt':
          return (
            ((a.redeemedAt?.getTime() ?? 0) - (b.redeemedAt?.getTime() ?? 0)) *
            direction
          );
        default:
          return (a.reservedAt.getTime() - b.reservedAt.getTime()) * direction;
      }
    });

    const start = (filter.page - 1) * filter.limit;

    return {
      items: matches
        .slice(start, start + filter.limit)
        .map((redemption) => ({ ...redemption })),
      total: matches.length,
    };
  }

  async summary(offerId?: string): Promise<RedemptionSummaryRecord> {
    const redeemed = [...this.redemptions.values()].filter(
      (redemption) =>
        redemption.status === 'redeemed' &&
        (!offerId || redemption.offerId === offerId),
    );

    return {
      totalRedemptions: redeemed.length,
      totalDiscountGiven: redeemed.reduce(
        (sum, redemption) => sum + redemption.discountAmount,
        0,
      ),
    };
  }

  reset(): void {
    this.redemptions.clear();
  }

  all(): RedemptionRecord[] {
    return [...this.redemptions.values()].map((redemption) => ({ ...redemption }));
  }
}
