import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import { CategoriesService } from '../categories/categories.service.js';
import { OrderEvents } from '../orders/order-events.js';
import { computeTotals, resolvePricingConfig } from '../orders/pricing.js';
import { SettingsService } from '../settings/settings.service.js';
import type { PricingConfig } from '../orders/pricing.js';
import type { OrderRecord } from '../orders/repositories/orders.repository.js';
import { ProductsService } from '../products/products.service.js';
import { CouponPricingService } from './coupon-pricing.js';
import type {
  CouponPricingLine,
  CouponQuote,
  CouponQuoteInput,
  CouponReservationInput,
} from './coupon-pricing.js';
import { describeIneligibility, evaluateOffer } from './discount.js';
import {
  describeDiscount,
  discountTypeLabel,
  offerStatus,
  OFFER_STATUS_LABELS,
  unavailableReason,
} from './offer-status.js';
import type { OfferLifecycleStatus } from './schemas/offer.schema.js';
import type { CreateOfferDto, UpdateOfferDto } from './dto/create-offer.dto.js';
import type { UpdateOfferStatusDto } from './dto/create-offer.dto.js';
import type {
  OffersQueryDto,
  PublicOffersQueryDto,
  RedemptionsQueryDto,
} from './dto/offers-query.dto.js';
import type { ValidateCouponDto } from './dto/create-offer.dto.js';
import { OffersRepository, RedemptionsRepository } from './repositories/offers.repository.js';
import type {
  CreateOfferInput,
  OfferActor,
  OfferRecord,
  RedemptionRecord,
} from './repositories/offers.repository.js';

export interface OfferView {
  id: string;
  name: string;
  description: string | null;
  code: string;
  type: OfferRecord['type'];
  typeLabel: string;
  value: number;
  /** "20% off", "₹150 off", "Free shipping". */
  valueLabel: string;
  minCartValue: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  totalUsageLimit: number | null;
  perCustomerLimit: number;
  usageCount: number;
  redeemedCount: number;
  remainingUses: number | null;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  excludedProductIds: string[];
  excludedCategoryIds: string[];
  customerVisible: boolean;
  isActive: boolean;
  status: OfferLifecycleStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfferDetailView extends OfferView {
  history: Array<{
    action: string;
    note: string | null;
    by: string | null;
    at: string;
  }>;
  createdBy: string | null;
  updatedBy: string | null;
  /** Finalised redemptions for this offer. */
  redemptionCount: number;
  discountGiven: number;
}

export interface OfferSummaryView {
  totalOffers: number;
  activeOffers: number;
  scheduledOffers: number;
  expiredOffers: number;
  exhaustedOffers: number;
  inactiveOffers: number;
  totalRedemptions: number;
  totalDiscountGiven: number;
}

export interface RedemptionView {
  redemptionId: string;
  offerId: string;
  code: string;
  type: OfferRecord['type'];
  value: number;
  orderId: string | null;
  orderNumber: string | null;
  userId: string | null;
  customerEmail: string;
  discountAmount: number;
  freeShipping: boolean;
  status: RedemptionRecord['status'];
  statusLabel: string;
  reservedAt: string;
  redeemedAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface PublicOfferView {
  id: string;
  name: string;
  description: string | null;
  code: string;
  type: OfferRecord['type'];
  value: number;
  valueLabel: string;
  minCartValue: number;
  minCartLabel: string | null;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  applicableCategories: Array<{ id: string; name: string }>;
  applicableProducts: Array<{ id: string; name: string }>;
}

/** Server-computed cart preview for a coupon; no amount comes from the browser. */
export interface CouponValidationView {
  valid: true;
  code: string;
  offerId: string;
  name: string;
  type: OfferRecord['type'];
  value: number;
  valueLabel: string;
  eligibleSubtotal: number;
  discount: number;
  freeShipping: boolean;
  subtotal: number;
  shippingCharge: number;
  taxAmount: number;
  total: number;
  currency: string;
  message: string;
}

const MAX_EXPORT_ROWS = 5_000;
const EXPORT_PAGE_SIZE = 250;
const PUBLIC_NAME_LIMIT = 10;

/**
 * Offers, coupons and redemptions.
 *
 * Three invariants drive the design:
 *
 * 1. **One pricing formula.** This service decides *how much* a coupon is worth
 *    (`evaluateOffer`) and hands that number to `computeTotals` — the same function
 *    checkout uses. It never computes a subtotal, shipping charge or tax itself.
 * 2. **Limits are claimed, not checked.** `OffersRepository.reserveUsage` performs
 *    a guarded atomic increment, so two simultaneous checkouts cannot both take the
 *    last use of a coupon.
 * 3. **Redemptions follow the order.** A reservation is made when the cart becomes
 *    an order; it is *finalised* when that order is confirmed and *reversed* when it
 *    is cancelled or returned — driven by order events, never by a page view.
 */
@Injectable()
export class CouponsService
  extends CouponPricingService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CouponsService.name);
  /**
   * Pricing configuration, refreshed from store settings at the entry of every
   * method that prices or renders money. `SettingsService` answers from memory, so
   * this costs no database round trip; the environment value is only a fallback
   * until the first refresh.
   */
  private pricing: PricingConfig = resolvePricingConfig();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly offers: OffersRepository,
    private readonly redemptions: RedemptionsRepository,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly orderEvents: OrderEvents,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  /** Pulls the current currency/tax/shipping configuration. */
  private async refreshPricing(): Promise<void> {
    this.pricing = await this.settings.pricing();
  }

  onModuleInit(): void {
    this.unsubscribe = this.orderEvents.onStatusChanged(async (order) => {
      await this.onOrderStatusChanged(order);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ------------------------------------------------------------------- admin

  async list(query: OffersQueryDto): Promise<PaginatedResult<OfferView>> {
    await this.refreshPricing();

    const now = new Date();
    const { items, total } = await this.offers.list({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      status: query.status,
      type: query.type,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      now,
    });

    return createPaginatedResult(
      items.map((offer) => this.toView(offer, now)),
      query.page,
      query.limit,
      total,
    );
  }

  async summary(): Promise<OfferSummaryView> {
    const now = new Date();
    const [counts, redemptionTotals] = await Promise.all([
      this.offers.counts(now),
      this.redemptions.summary(),
    ]);

    return { ...counts, ...redemptionTotals };
  }

  async get(id: string): Promise<OfferDetailView> {
    await this.refreshPricing();

    const offer = await this.requireOffer(id);
    const now = new Date();
    const { total } = await this.redemptions.list({
      page: 1,
      limit: 1,
      offerId: offer.id,
      status: 'redeemed',
      sortBy: 'reservedAt',
      sortOrder: 'desc',
    });
    const totals = await this.redemptions.summary(offer.id);

    return {
      ...this.toView(offer, now),
      history: offer.history
        .slice()
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .map((entry) => ({
          action: entry.action,
          note: entry.note ?? null,
          by: entry.by?.email ?? null,
          at: entry.at.toISOString(),
        })),
      createdBy: offer.createdBy?.email ?? null,
      updatedBy: offer.updatedBy?.email ?? null,
      redemptionCount: total,
      discountGiven: totals.totalDiscountGiven,
    };
  }

  async create(dto: CreateOfferDto, actor: AuthenticatedUser): Promise<OfferDetailView> {
    await this.refreshPricing();

    this.assertValidConfig({
      type: dto.type,
      value: dto.value,
      minCartValue: dto.minCartValue ?? 0,
      maxDiscount: dto.maxDiscount ?? null,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      totalUsageLimit: dto.totalUsageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? 1,
      applicableProductIds: dto.applicableProductIds ?? [],
      applicableCategoryIds: dto.applicableCategoryIds ?? [],
      excludedProductIds: dto.excludedProductIds ?? [],
      excludedCategoryIds: dto.excludedCategoryIds ?? [],
    });

    const input: CreateOfferInput = {
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      code: dto.code.trim().toUpperCase(),
      type: dto.type,
      value: dto.value,
      minCartValue: dto.minCartValue ?? 0,
      maxDiscount: dto.maxDiscount ?? null,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      totalUsageLimit: dto.totalUsageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? 1,
      applicableProductIds: dto.applicableProductIds ?? [],
      applicableCategoryIds: dto.applicableCategoryIds ?? [],
      excludedProductIds: dto.excludedProductIds ?? [],
      excludedCategoryIds: dto.excludedCategoryIds ?? [],
      customerVisible: dto.customerVisible ?? true,
      isActive: dto.isActive ?? true,
      createdBy: toActor(actor),
      history: [
        {
          action: 'created',
          note: `Offer created (${dto.code.trim().toUpperCase()})`,
          by: toActor(actor),
          at: new Date(),
        },
      ],
    };

    const created = await this.offers.create(input);

    if (!created) {
      throw new ConflictException(
        `Coupon code "${input.code}" is already used by another offer`,
      );
    }

    this.logger.log(`offer ${created.code} created`);

    return this.get(created.id);
  }

  async update(
    id: string,
    dto: UpdateOfferDto,
    actor: AuthenticatedUser,
  ): Promise<OfferDetailView> {
    const offer = await this.requireOffer(id);
    const merged = {
      type: dto.type ?? offer.type,
      value: dto.value ?? offer.value,
      minCartValue: dto.minCartValue ?? offer.minCartValue,
      maxDiscount:
        dto.maxDiscount === undefined ? offer.maxDiscount : dto.maxDiscount,
      startsAt: dto.startsAt ?? offer.startsAt,
      endsAt: dto.endsAt ?? offer.endsAt,
      totalUsageLimit:
        dto.totalUsageLimit === undefined
          ? offer.totalUsageLimit
          : dto.totalUsageLimit,
      perCustomerLimit: dto.perCustomerLimit ?? offer.perCustomerLimit,
      applicableProductIds: dto.applicableProductIds ?? offer.applicableProductIds,
      applicableCategoryIds: dto.applicableCategoryIds ?? offer.applicableCategoryIds,
      excludedProductIds: dto.excludedProductIds ?? offer.excludedProductIds,
      excludedCategoryIds: dto.excludedCategoryIds ?? offer.excludedCategoryIds,
    };

    this.assertValidConfig(merged, offer);

    const updated = await this.offers.update(id, {
      name: dto.name?.trim(),
      description: dto.description === undefined ? undefined : dto.description.trim() || null,
      code: dto.code?.trim().toUpperCase(),
      type: dto.type,
      value: dto.value,
      minCartValue: dto.minCartValue,
      maxDiscount: dto.maxDiscount === undefined ? undefined : dto.maxDiscount,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      totalUsageLimit: dto.totalUsageLimit === undefined ? undefined : dto.totalUsageLimit,
      perCustomerLimit: dto.perCustomerLimit,
      applicableProductIds: dto.applicableProductIds,
      applicableCategoryIds: dto.applicableCategoryIds,
      excludedProductIds: dto.excludedProductIds,
      excludedCategoryIds: dto.excludedCategoryIds,
      customerVisible: dto.customerVisible,
      isActive: dto.isActive,
      updatedBy: toActor(actor),
      history: [
        {
          action: 'updated',
          note: summarizeChanges(dto),
          by: toActor(actor),
          at: new Date(),
        },
      ],
    });

    if (!updated) {
      throw new ConflictException(
        dto.code
          ? `Coupon code "${dto.code.trim().toUpperCase()}" is already used by another offer`
          : 'This offer could not be updated',
      );
    }

    return this.get(updated.id);
  }

  async changeStatus(
    id: string,
    dto: UpdateOfferStatusDto,
    actor: AuthenticatedUser,
  ): Promise<OfferDetailView> {
    const offer = await this.requireOffer(id);

    if (offer.isActive === dto.isActive) {
      throw new BadRequestException(
        dto.isActive ? 'This offer is already active' : 'This offer is already inactive',
      );
    }

    const updated = await this.offers.update(id, {
      isActive: dto.isActive,
      updatedBy: toActor(actor),
      history: [
        {
          action: dto.isActive ? 'activated' : 'deactivated',
          note: dto.reason?.trim(),
          by: toActor(actor),
          at: new Date(),
        },
      ],
    });

    if (!updated) {
      throw new NotFoundException('Offer not found');
    }

    return this.get(updated.id);
  }

  /**
   * Archive instead of delete.
   *
   * Past orders reference the code and their redemptions reference the offer, so a
   * hard delete would rewrite history. Archiving hides the offer everywhere and
   * keeps the audit trail intact.
   */
  async archive(id: string, actor: AuthenticatedUser): Promise<OfferDetailView> {
    await this.refreshPricing();

    const offer = await this.requireOffer(id);

    if (!offer.isActive && !offer.customerVisible) {
      throw new ConflictException('This offer is already archived');
    }

    const updated = await this.offers.update(id, {
      isActive: false,
      customerVisible: false,
      updatedBy: toActor(actor),
      history: [
        {
          action: 'archived',
          note: 'Archived — past redemptions and orders are preserved',
          by: toActor(actor),
          at: new Date(),
        },
      ],
    });

    if (!updated) {
      throw new NotFoundException('Offer not found');
    }

    return this.get(updated.id);
  }

  async listRedemptions(
    query: RedemptionsQueryDto,
  ): Promise<PaginatedResult<RedemptionView>> {
    const { items, total } = await this.redemptions.list({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      status: query.status,
      offerId: query.offerId,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return createPaginatedResult(
      items.map((redemption) => this.toRedemptionView(redemption)),
      query.page,
      query.limit,
      total,
    );
  }

  async redemptionsForOffer(
    id: string,
    query: RedemptionsQueryDto,
  ): Promise<PaginatedResult<RedemptionView>> {
    const offer = await this.requireOffer(id);

    return this.listRedemptions({ ...query, offerId: offer.id });
  }

  /** CSV of the filtered redemptions — allow-listed columns only. */
  async exportRedemptionsCsv(query: RedemptionsQueryDto): Promise<string> {
    const rows: RedemptionRecord[] = [];
    let page = 1;

    while (rows.length < MAX_EXPORT_ROWS) {
      const { items, total } = await this.redemptions.list({
        page,
        limit: EXPORT_PAGE_SIZE,
        search: query.search?.trim(),
        status: query.status,
        offerId: query.offerId,
        from: query.from,
        to: query.to,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      rows.push(...items);

      if (rows.length >= total || items.length === 0) {
        break;
      }
      page += 1;
    }

    const lines = [
      ['Coupon code', 'Order number', 'Customer email', 'Discount amount', 'Status', 'Reserved at', 'Redeemed at'],
      ...rows.slice(0, MAX_EXPORT_ROWS).map((redemption) => [
        redemption.code,
        redemption.orderNumber ?? '',
        redemption.customerEmail,
        money(redemption.discountAmount),
        redemption.status,
        redemption.reservedAt.toISOString(),
        redemption.redeemedAt?.toISOString() ?? '',
      ]),
    ];

    return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
  }

  // ---------------------------------------------------------------- customer

  /** Active, customer-visible offers for `/offers`. */
  async publicOffers(query: PublicOffersQueryDto): Promise<PublicOfferView[]> {
    await this.refreshPricing();

    const offers = await this.offers.listPublic(
      { search: query.search?.trim(), limit: query.limit },
      new Date(),
    );

    return Promise.all(offers.map((offer) => this.toPublicView(offer)));
  }

  /**
   * Validates a code against a cart and previews the totals.
   *
   * Pure read: it claims nothing, so a customer can try codes freely and a retry
   * can never consume a use.
   */
  async validate(
    dto: ValidateCouponDto,
    user: AuthenticatedUser | null,
  ): Promise<CouponValidationView> {
    await this.refreshPricing();

    const lines = await this.resolveLines(dto.items);
    const quote = await this.quote({
      code: dto.code,
      lines,
      userId: user?.id ?? null,
      customerEmail: user?.email ?? '',
    });
    const totals = computeTotals(
      lines.map((line) => ({
        unitPrice: line.unitPrice,
        listPrice: line.unitPrice,
        quantity: line.quantity,
      })),
      this.pricing,
      quote.discount,
      { freeShipping: quote.freeShipping },
    );

    return {
      valid: true,
      code: quote.code,
      offerId: quote.offerId,
      name: quote.name,
      type: quote.type,
      value: quote.value,
      valueLabel: quote.summary,
      eligibleSubtotal: quote.eligibleSubtotal,
      discount: totals.couponDiscount,
      freeShipping: quote.freeShipping,
      subtotal: totals.subtotal,
      shippingCharge: totals.shippingCharge,
      taxAmount: totals.taxAmount,
      total: totals.total,
      currency: this.pricing.currency,
      message:
        quote.freeShipping && totals.shippingCharge === 0
          ? 'Coupon applied — shipping is free'
          : 'Coupon applied',
    };
  }

  // ------------------------------------------------------------- pricing port

  async quote(input: CouponQuoteInput): Promise<CouponQuote> {
    await this.refreshPricing();

    const code = input.code?.trim().toUpperCase();

    if (!code) {
      throw new BadRequestException('Enter a coupon code');
    }

    const offer = await this.offers.findByCode(code);

    // Same message for "unknown" and "archived": a wrong guess learns nothing.
    if (!offer) {
      throw new BadRequestException('This coupon code is not valid');
    }

    const status = offerStatus(offer, new Date());

    if (status !== 'active') {
      throw new BadRequestException(unavailableReason(status));
    }

    const evaluation = evaluateOffer(toRule(offer), input.lines);

    if (evaluation.reason) {
      throw new BadRequestException(
        describeIneligibility(evaluation, {
          type: offer.type,
          minCartValue: offer.minCartValue,
          currency: this.pricing.currency,
        }),
      );
    }

    const customerKey = this.customerKey(input.userId, input.customerEmail);

    if (customerKey && offer.perCustomerLimit > 0) {
      const used = await this.offers.customerUsage(offer.id, customerKey);

      if (used >= offer.perCustomerLimit) {
        throw new BadRequestException(
          offer.perCustomerLimit === 1
            ? 'You have already used this coupon'
            : `This coupon can be used ${offer.perCustomerLimit} times per customer`,
        );
      }
    }

    return {
      offerId: offer.id,
      code: offer.code,
      name: offer.name,
      type: offer.type,
      value: offer.value,
      minCartValue: offer.minCartValue,
      maxDiscount: offer.maxDiscount,
      discount: evaluation.discount,
      freeShipping: evaluation.freeShipping,
      eligibleSubtotal: evaluation.eligibleSubtotal,
      summary: describeDiscount(offer.type, offer.value, this.pricing.currency),
    };
  }

  /**
   * Claims one use and records the reservation.
   *
   * The counter is claimed **before** the redemption row is written, so a lost race
   * refuses the coupon instead of creating a redemption that exceeds the limit.
   */
  async reserve(input: CouponReservationInput): Promise<string> {
    const offer = await this.offers.findById(input.quote.offerId);

    if (!offer) {
      throw new BadRequestException('This coupon code is not valid');
    }

    const status = offerStatus(offer, new Date());

    if (status !== 'active') {
      throw new ConflictException(unavailableReason(status));
    }

    const customerKey = this.customerKey(input.userId, input.customerEmail) ?? 'guest';
    const claimed = await this.offers.reserveUsage(offer.id, {
      customerKey,
      now: new Date(),
    });

    if (!claimed) {
      throw new ConflictException(
        'This coupon is no longer available — it has reached its limit or was switched off',
      );
    }

    const redemptionId = randomUUID();
    const created = await this.redemptions.create({
      redemptionId,
      offerId: offer.id,
      code: offer.code,
      type: offer.type,
      value: offer.value,
      userId: input.userId,
      customerEmail: (input.customerEmail || 'guest@unknown').toLowerCase(),
      discountAmount: input.quote.discount,
      freeShipping: input.quote.freeShipping,
      reservedAt: new Date(),
    });

    if (!created) {
      await this.offers.releaseUsage(offer.id, customerKey);
      throw new ConflictException('This coupon has already been applied to this order');
    }

    return redemptionId;
  }

  async attach(
    redemptionId: string,
    order: { orderId: string; orderNumber: string },
  ): Promise<void> {
    await this.redemptions.attachOrder(redemptionId, order);
  }

  async release(redemptionId: string): Promise<void> {
    const redemption = await this.redemptions.findById(redemptionId);

    if (!redemption) {
      return;
    }

    await this.reverseRedemption(redemption, 'Order could not be placed');
  }

  // ---------------------------------------------------------------- internals

  /**
   * Confirms or reverses a redemption as its order moves.
   *
   * Confirmation happens on `confirmed` (the store's "we accepted this sale" state,
   * reached for both prepaid and cash-on-delivery orders); cancellation and return
   * release the use so the limit is not consumed by an order that never stood.
   */
  private async onOrderStatusChanged(order: OrderRecord): Promise<void> {
    const redemption = await this.redemptions.findByOrderId(order.id);

    if (!redemption || redemption.status === 'reversed') {
      return;
    }

    if (order.status === 'confirmed') {
      const confirmed = await this.redemptions.confirm(redemption.redemptionId, new Date());

      if (confirmed) {
        await this.offers.markRedeemed(redemption.offerId);
      }
      return;
    }

    if (order.status === 'cancelled' || order.status === 'returned') {
      const reason =
        order.status === 'cancelled'
          ? 'Order cancelled — discount released'
          : 'Order returned — discount released';

      await this.reverseRedemption(redemption, reason);
    }
  }

  /** Reverses once: guarded by the stored status, so retries cannot double-count. */
  private async reverseRedemption(
    redemption: RedemptionRecord,
    reason: string,
  ): Promise<void> {
    const previous = await this.redemptions.reverse(redemption.redemptionId, {
      at: new Date(),
      reason,
    });

    if (!previous) {
      return;
    }

    const customerKey =
      this.customerKey(redemption.userId, redemption.customerEmail) ?? 'guest';

    await this.offers.releaseUsage(redemption.offerId, customerKey);

    if (previous === 'redeemed') {
      await this.offers.unmarkRedeemed(redemption.offerId);
    }

    this.logger.log(
      `coupon ${redemption.code} released from order ${redemption.orderNumber ?? '(none)'}: ${reason}`,
    );
  }

  private async requireOffer(id: string): Promise<OfferRecord> {
    const offer = await this.offers.findById(id);

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    return offer;
  }

  /** Prices the cart the same way checkout does — from product records. */
  private async resolveLines(
    items: ValidateCouponDto['items'],
  ): Promise<CouponPricingLine[]> {
    const lines: CouponPricingLine[] = [];

    for (const item of items) {
      let product;

      try {
        product = await this.productsService.getForAdmin(item.productId);
      } catch {
        throw new BadRequestException('One of the products in your cart is unavailable');
      }

      if (product.status !== 'published') {
        throw new BadRequestException('One of the products in your cart is unavailable');
      }

      lines.push({
        productId: String(product.id),
        categoryId: product.categoryId ? String(product.categoryId) : null,
        unitPrice: product.effectivePrice,
        quantity: item.quantity,
      });
    }

    return lines;
  }

  private customerKey(userId: string | null, customerEmail: string): string | null {
    if (userId) {
      return userId;
    }
    const email = customerEmail?.trim().toLowerCase();

    return email && email.length > 0 ? `email:${email}` : null;
  }

  private assertValidConfig(
    input: {
      type: OfferRecord['type'];
      value: number;
      minCartValue: number;
      maxDiscount: number | null;
      startsAt: Date;
      endsAt: Date;
      totalUsageLimit: number | null;
      perCustomerLimit: number;
      applicableProductIds: string[];
      applicableCategoryIds: string[];
      excludedProductIds: string[];
      excludedCategoryIds: string[];
    },
    existing?: OfferRecord,
  ): void {
    if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime())) {
      throw new BadRequestException('Start and expiry dates are required');
    }
    if (input.startsAt.getTime() >= input.endsAt.getTime()) {
      throw new BadRequestException('The start date must be before the expiry date');
    }
    if (!Number.isInteger(input.value) || input.value < 0) {
      throw new BadRequestException('Discount value must be a positive whole number');
    }

    if (input.type === 'percentage') {
      if (input.value < 1 || input.value > 100) {
        throw new BadRequestException('A percentage discount must be between 1 and 100');
      }
      if (input.maxDiscount !== null && input.maxDiscount < 1) {
        throw new BadRequestException('Maximum discount must be greater than zero');
      }
    } else if (input.type === 'fixed') {
      if (input.value < 1) {
        throw new BadRequestException('A fixed discount must be greater than zero');
      }
      if (input.maxDiscount !== null) {
        throw new BadRequestException('Only a percentage offer can have a maximum discount');
      }
    } else {
      if (input.value !== 0) {
        throw new BadRequestException('A free-shipping offer has no discount value');
      }
      if (input.maxDiscount !== null) {
        throw new BadRequestException('Only a percentage offer can have a maximum discount');
      }
    }

    if (input.minCartValue < 0) {
      throw new BadRequestException('Minimum cart value cannot be negative');
    }
    if (input.totalUsageLimit !== null && input.totalUsageLimit < 1) {
      throw new BadRequestException('Total usage limit must be at least 1');
    }
    if (input.perCustomerLimit < 1) {
      throw new BadRequestException('Per-customer limit must be at least 1');
    }
    if (
      input.totalUsageLimit !== null &&
      input.perCustomerLimit > input.totalUsageLimit
    ) {
      throw new BadRequestException(
        'The per-customer limit cannot exceed the total usage limit',
      );
    }
    if (
      existing &&
      input.totalUsageLimit !== null &&
      input.totalUsageLimit < existing.usageCount
    ) {
      throw new BadRequestException(
        `The total usage limit cannot be set below the ${existing.usageCount} uses already claimed`,
      );
    }

    const overlap = (a: string[], b: string[]) => a.filter((id) => b.includes(id));

    if (overlap(input.applicableProductIds, input.excludedProductIds).length > 0) {
      throw new BadRequestException(
        'A product cannot be both applicable and excluded on the same offer',
      );
    }
    if (
      overlap(input.applicableCategoryIds, input.excludedCategoryIds).length > 0
    ) {
      throw new BadRequestException(
        'A category cannot be both applicable and excluded on the same offer',
      );
    }
  }

  private toView(offer: OfferRecord, now: Date): OfferView {
    const status = offerStatus(offer, now);
    const remainingUses =
      offer.totalUsageLimit === null
        ? null
        : Math.max(0, offer.totalUsageLimit - offer.usageCount);

    return {
      id: offer.id,
      name: offer.name,
      description: offer.description ?? null,
      code: offer.code,
      type: offer.type,
      typeLabel: discountTypeLabel(offer.type),
      value: offer.value,
      valueLabel: describeDiscount(offer.type, offer.value, this.pricing.currency),
      minCartValue: offer.minCartValue,
      maxDiscount: offer.maxDiscount,
      startsAt: offer.startsAt.toISOString(),
      endsAt: offer.endsAt.toISOString(),
      totalUsageLimit: offer.totalUsageLimit,
      perCustomerLimit: offer.perCustomerLimit,
      usageCount: offer.usageCount,
      redeemedCount: offer.redeemedCount,
      remainingUses,
      applicableProductIds: offer.applicableProductIds,
      applicableCategoryIds: offer.applicableCategoryIds,
      excludedProductIds: offer.excludedProductIds,
      excludedCategoryIds: offer.excludedCategoryIds,
      customerVisible: offer.customerVisible,
      isActive: offer.isActive,
      status,
      statusLabel: OFFER_STATUS_LABELS[status],
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
    };
  }

  private toRedemptionView(redemption: RedemptionRecord): RedemptionView {
    return {
      redemptionId: redemption.redemptionId,
      offerId: redemption.offerId,
      code: redemption.code,
      type: redemption.type,
      value: redemption.value,
      orderId: redemption.orderId,
      orderNumber: redemption.orderNumber,
      userId: redemption.userId,
      customerEmail: redemption.customerEmail,
      discountAmount: redemption.discountAmount,
      freeShipping: redemption.freeShipping,
      status: redemption.status,
      statusLabel:
        redemption.status === 'redeemed'
          ? 'Redeemed'
          : redemption.status === 'reserved'
            ? 'Awaiting confirmation'
            : 'Reversed',
      reservedAt: redemption.reservedAt.toISOString(),
      redeemedAt: redemption.redeemedAt?.toISOString() ?? null,
      reversedAt: redemption.reversedAt?.toISOString() ?? null,
      reversalReason: redemption.reversalReason,
    };
  }

  /** Public projection: no limits, no counters, no internal campaign settings. */
  private async toPublicView(offer: {
    id: string;
    name: string;
    description?: string;
    code: string;
    type: OfferRecord['type'];
    value: number;
    minCartValue: number;
    maxDiscount: number | null;
    startsAt: Date;
    endsAt: Date;
    applicableProductIds: string[];
    applicableCategoryIds: string[];
  }): Promise<PublicOfferView> {
    const categories = await Promise.all(
      offer.applicableCategoryIds
        .slice(0, PUBLIC_NAME_LIMIT)
        .map(async (id) => {
          const category = await this.categoriesService.findById(id).catch(() => null);

          return category ? { id, name: category.name } : null;
        }),
    );
    const products = await Promise.all(
      offer.applicableProductIds.slice(0, PUBLIC_NAME_LIMIT).map(async (id) => {
        try {
          const product = await this.productsService.getForAdmin(id);

          return { id, name: product.name };
        } catch {
          return null;
        }
      }),
    );

    return {
      id: offer.id,
      name: offer.name,
      description: offer.description ?? null,
      code: offer.code,
      type: offer.type,
      value: offer.value,
      valueLabel: describeDiscount(offer.type, offer.value, this.pricing.currency),
      minCartValue: offer.minCartValue,
      minCartLabel:
        offer.minCartValue > 0
          ? `Minimum order ${formatMoney(offer.minCartValue, this.pricing.currency)}`
          : null,
      maxDiscount: offer.maxDiscount,
      startsAt: offer.startsAt.toISOString(),
      endsAt: offer.endsAt.toISOString(),
      applicableCategories: categories.filter(
        (entry): entry is { id: string; name: string } => entry !== null,
      ),
      applicableProducts: products.filter(
        (entry): entry is { id: string; name: string } => entry !== null,
      ),
    };
  }
}

function toActor(actor: AuthenticatedUser): OfferActor {
  return { userId: actor.id, email: actor.email };
}

function toRule(offer: OfferRecord) {
  return {
    type: offer.type,
    value: offer.value,
    minCartValue: offer.minCartValue,
    maxDiscount: offer.maxDiscount,
    applicableProductIds: offer.applicableProductIds,
    applicableCategoryIds: offer.applicableCategoryIds,
    excludedProductIds: offer.excludedProductIds,
    excludedCategoryIds: offer.excludedCategoryIds,
  };
}

function summarizeChanges(dto: UpdateOfferDto): string {
  const fields = Object.entries(dto)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  return fields.length > 0 ? `Updated ${fields.join(', ')}` : 'No changes';
}

function formatMoney(minorUnits: number, currency: string): string {
  const amount = (minorUnits / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });

  return currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`;
}

function money(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
