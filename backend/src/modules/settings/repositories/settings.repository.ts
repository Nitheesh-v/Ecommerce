import type { StoreAddress } from '../schemas/setting.schema.js';

export interface SettingsActor {
  userId?: string;
  email: string;
}

export interface StoreSettingsRecord {
  storeName: string;
  legalName: string | null;
  supportEmail: string;
  supportPhone: string;
  address: StoreAddress;
  invoiceFooter: string | null;
  orderNote: string | null;
  currency: string;
  locale: string;
  /** Percentage added on top of the goods value. */
  taxRatePercent: number;
  /** Flat fee, minor units. */
  flatShippingCharge: number;
  /** Free shipping from this order value, minor units. */
  freeShippingThreshold: number;
  codEnabled: boolean;
  updatedBy: SettingsActor | null;
  createdAt: Date;
  updatedAt: Date;
}

export type StoreSettingsPatch = Partial<
  Omit<StoreSettingsRecord, 'createdAt' | 'updatedAt' | 'updatedBy'>
>;

/**
 * Settings persistence.
 *
 * Nothing exists until the first read or admin save, so `find()` returning `null`
 * is normal — the service seeds the row from the environment defaults at that
 * point. Only one document ever exists (`key: 'store'`).
 */
export abstract class SettingsRepository {
  abstract find(): Promise<StoreSettingsRecord | null>;

  abstract create(input: StoreSettingsRecord): Promise<StoreSettingsRecord>;

  abstract update(
    patch: StoreSettingsPatch,
    actor: SettingsActor,
  ): Promise<StoreSettingsRecord | null>;

  /**
   * How many orders and products exist.
   *
   * Used by the currency guard. It is read here rather than through OrdersModule on
   * purpose: orders depend on settings for pricing, so settings must not depend on
   * orders or the DI graph becomes a cycle. These are two `countDocuments` calls on
   * models, not business logic.
   */
  abstract dataFootprint(): Promise<{ orders: number; products: number }>;
}
