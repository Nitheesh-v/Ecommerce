import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { resolvePricingConfig } from '../orders/pricing.js';
import type { PricingConfig } from '../orders/pricing.js';
import { SettingsRepository } from './repositories/settings.repository.js';
import type { StoreSettingsRecord } from './repositories/settings.repository.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';
import type { StoreAddress } from './schemas/setting.schema.js';

export interface SettingsView {
  storeName: string;
  legalName: string | null;
  supportEmail: string;
  supportPhone: string;
  address: StoreAddress;
  invoiceFooter: string | null;
  orderNote: string | null;
  currency: string;
  locale: string;
  taxRatePercent: number;
  flatShippingCharge: number;
  freeShippingThreshold: number;
  codEnabled: boolean;
  /**
   * `true` once the store has products or orders: every stored price is a minor-unit
   * amount in the current currency, so switching it would relabel money, not convert
   * it. The console uses this to disable the field and explain why.
   */
  currencyLocked: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PublicStoreView {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  address: StoreAddress;
  currency: string;
  locale: string;
  codEnabled: boolean;
}

const CURRENCY_ISO = /^[A-Z]{3}$/;

/**
 * Store settings, and the single source of pricing configuration.
 *
 * Two jobs, one owner:
 *
 * 1. **The settings document** — store identity, invoice details, and the commerce
 *    numbers (tax, shipping, free-shipping threshold, currency, locale).
 * 2. **The pricing authority** — `pricing()` is what `OrdersService` and
 *    `CouponsService` read. Environment variables only seed the row on first use;
 *    after that the database wins, so an admin change takes effect on the next order
 *    without a redeploy and without ever rewriting an existing order.
 *
 * The record is cached in memory for a short window and invalidated on write, so
 * checkout does not hit the database for every line it prices.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly fallback: PricingConfig;
  private cached: StoreSettingsRecord | null = null;
  private loading: Promise<StoreSettingsRecord> | null = null;

  constructor(private readonly settings: SettingsRepository) {
    // The environment is only the seed for a fresh store; the database wins after.
    this.fallback = resolvePricingConfig();
  }

  /** The settings document, seeded from the environment defaults on first read. */
  async get(): Promise<StoreSettingsRecord> {
    if (this.cached) {
      return this.cached;
    }

    if (!this.loading) {
      this.loading = this.loadOrSeed().finally(() => {
        this.loading = null;
      });
    }

    this.cached = await this.loading;

    return this.cached;
  }

  /** What checkout prices with. */
  async pricing(): Promise<PricingConfig> {
    const settings = await this.get();

    return {
      currency: settings.currency,
      taxRatePercent: settings.taxRatePercent,
      flatShippingCharge: settings.flatShippingCharge,
      freeShippingThreshold: settings.freeShippingThreshold,
    };
  }

  /** Cash-on-delivery is an operator decision, not a hardcoded payment method. */
  async codEnabled(): Promise<boolean> {
    return (await this.get()).codEnabled;
  }

  async view(): Promise<SettingsView> {
    const [settings, footprint] = await Promise.all([
      this.get(),
      this.settings.dataFootprint().catch(() => ({ orders: 0, products: 0 })),
    ]);

    return {
      storeName: settings.storeName,
      legalName: settings.legalName,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      address: settings.address,
      invoiceFooter: settings.invoiceFooter,
      orderNote: settings.orderNote,
      currency: settings.currency,
      locale: settings.locale,
      taxRatePercent: settings.taxRatePercent,
      flatShippingCharge: settings.flatShippingCharge,
      freeShippingThreshold: settings.freeShippingThreshold,
      codEnabled: settings.codEnabled,
      currencyLocked: footprint.orders > 0 || footprint.products > 0,
      updatedBy: settings.updatedBy?.email ?? null,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  /** Safe subset for the storefront (footer, contact block). */
  async publicView(): Promise<PublicStoreView> {
    const settings = await this.get();

    return {
      storeName: settings.storeName,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      address: settings.address,
      currency: settings.currency,
      locale: settings.locale,
      codEnabled: settings.codEnabled,
    };
  }

  async update(dto: UpdateSettingsDto, actor: AuthenticatedUser): Promise<SettingsView> {
    const current = await this.get();
    const next = merge(current, dto);

    this.assertValid(next);

    if (next.currency !== current.currency) {
      const footprint = await this.settings.dataFootprint();

      if (footprint.orders > 0 || footprint.products > 0) {
        throw new ConflictException(
          `Currency cannot change while the store has products or orders (${footprint.products} products, ${footprint.orders} orders): ` +
            'prices are stored as minor units of the current currency, so switching would relabel money rather than convert it',
        );
      }
    }

    const updated = await this.settings.update(
      {
        storeName: next.storeName,
        legalName: next.legalName,
        supportEmail: next.supportEmail,
        supportPhone: next.supportPhone,
        address: next.address,
        invoiceFooter: next.invoiceFooter,
        orderNote: next.orderNote,
        currency: next.currency,
        locale: next.locale,
        taxRatePercent: next.taxRatePercent,
        flatShippingCharge: next.flatShippingCharge,
        freeShippingThreshold: next.freeShippingThreshold,
        codEnabled: next.codEnabled,
      },
      actor,
    );

    if (!updated) {
      // The row disappeared between read and write; recreate it from the merged value.
      this.cached = await this.settings.create({
        ...next,
        updatedBy: { userId: actor.id, email: actor.email },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return this.view();
    }

    this.cached = updated;

    return this.view();
  }

  /** Drops the cache — used by tests and after a manual data fix. */
  invalidate(): void {
    this.cached = null;
  }

  private async loadOrSeed(): Promise<StoreSettingsRecord> {
    const existing = await this.settings.find();

    if (existing) {
      return existing;
    }

    this.logger.log('Seeding store settings from environment defaults');

    const now = new Date();

    return this.settings.create({
      ...DEFAULT_IDENTITY,
      currency: this.fallback.currency,
      locale: 'en-IN',
      taxRatePercent: this.fallback.taxRatePercent,
      flatShippingCharge: this.fallback.flatShippingCharge,
      freeShippingThreshold: this.fallback.freeShippingThreshold,
      codEnabled: true,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  private assertValid(settings: StoreSettingsRecord): void {
    if (settings.storeName.trim().length < 2) {
      throw new BadRequestException('Store name is too short');
    }
    if (!CURRENCY_ISO.test(settings.currency)) {
      throw new BadRequestException('Currency must be a 3-letter ISO 4217 code');
    }
    if (settings.taxRatePercent < 0 || settings.taxRatePercent > 100) {
      throw new BadRequestException('Tax rate must be between 0 and 100');
    }
    if (settings.flatShippingCharge < 0 || settings.freeShippingThreshold < 0) {
      throw new BadRequestException('Shipping amounts cannot be negative');
    }
    if (!Number.isInteger(settings.taxRatePercent)) {
      throw new BadRequestException('Tax rate must be a whole percentage');
    }

    const address = settings.address;

    if (!address.line1?.trim() || !address.city?.trim() || !address.state?.trim()) {
      throw new BadRequestException(
        'The store address needs at least a street line, city and state',
      );
    }
    if (!/^\d{3,10}$/.test(address.postalCode?.trim() ?? '')) {
      throw new BadRequestException('Postal code must be 3–10 digits');
    }
  }
}

/** Identity used the very first time a store boots, before an admin edits anything. */
const DEFAULT_IDENTITY = {
  storeName: 'Ecommerce26',
  legalName: null,
  supportEmail: 'support@example.com',
  supportPhone: '+91 90000 00000',
  address: {
    line1: '1 Market Road',
    line2: undefined,
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    postalCode: '641001',
    country: 'India',
  },
  invoiceFooter: null,
  orderNote: null,
} as const;

function merge(
  current: StoreSettingsRecord,
  dto: UpdateSettingsDto,
): StoreSettingsRecord {
  return {
    ...current,
    storeName: dto.storeName?.trim() ?? current.storeName,
    legalName: dto.legalName === undefined ? current.legalName : dto.legalName.trim() || null,
    supportEmail: dto.supportEmail?.trim().toLowerCase() ?? current.supportEmail,
    supportPhone: dto.supportPhone?.trim() ?? current.supportPhone,
    address: {
      line1: dto.address?.line1?.trim() ?? current.address.line1,
      line2:
        dto.address?.line2 === undefined
          ? current.address.line2
          : dto.address.line2.trim() || undefined,
      city: dto.address?.city?.trim() ?? current.address.city,
      state: dto.address?.state?.trim() ?? current.address.state,
      postalCode: dto.address?.postalCode?.trim() ?? current.address.postalCode,
      country: dto.address?.country?.trim() ?? current.address.country,
    },
    invoiceFooter:
      dto.invoiceFooter === undefined ? current.invoiceFooter : dto.invoiceFooter.trim() || null,
    orderNote: dto.orderNote === undefined ? current.orderNote : dto.orderNote.trim() || null,
    currency: dto.currency?.toUpperCase() ?? current.currency,
    locale: dto.locale ?? current.locale,
    taxRatePercent: dto.taxRatePercent ?? current.taxRatePercent,
    flatShippingCharge: dto.flatShippingCharge ?? current.flatShippingCharge,
    freeShippingThreshold:
      dto.freeShippingThreshold ?? current.freeShippingThreshold,
    codEnabled: dto.codEnabled ?? current.codEnabled,
    updatedBy: current.updatedBy,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
  };
}
