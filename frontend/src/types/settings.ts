/** Store settings, as the admin console sees them. Money is minor units (paise). */

export interface StoreAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface StoreSettings {
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
  /** Flat shipping fee, minor units. */
  flatShippingCharge: number;
  /** Free shipping from this order value, minor units. */
  freeShippingThreshold: number;
  codEnabled: boolean;
  /** Highest COD order total, minor units; `0` means no cap. */
  codMaxAmount: number;
  /**
   * `true` once products or orders exist: stored prices are amounts in the current
   * currency, so switching it would relabel money instead of converting it.
   */
  currencyLocked: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export type UpdateSettingsPayload = Partial<{
  storeName: string;
  legalName: string;
  supportEmail: string;
  supportPhone: string;
  address: Partial<StoreAddress>;
  invoiceFooter: string;
  orderNote: string;
  currency: string;
  locale: string;
  taxRatePercent: number;
  flatShippingCharge: number;
  freeShippingThreshold: number;
  codEnabled: boolean;
  codMaxAmount: number;
}>;

/** The public subset the storefront may read. */
export interface PublicStoreSettings {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  address: StoreAddress;
  currency: string;
  locale: string;
  codEnabled: boolean;
  /** Highest COD order total, minor units; `0` means no cap. */
  codMaxAmount: number;
}
