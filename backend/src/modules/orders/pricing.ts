/**
 * Order pricing.
 *
 * Rule: **the server computes every number**. The client only ever says *what*
 * it wants to buy and *where* it ships; prices, discounts, shipping and tax come
 * from here, using the product records read at creation time.
 *
 * Money is integer minor units (paise) throughout — no floats, no rounding drift.
 *
 * Configuration (all optional, defaults below):
 *   ORDER_FREE_SHIPPING_THRESHOLD  minor units, default 99900 (₹999)
 *   ORDER_FLAT_SHIPPING_CHARGE     minor units, default 4900  (₹49)
 *   ORDER_TAX_RATE_PERCENT         default 0 — prices are treated as
 *                                  tax-inclusive, which is the norm in India.
 *                                  Set to e.g. 18 to add GST on top.
 */
export interface PricingConfig {
  freeShippingThreshold: number;
  flatShippingCharge: number;
  taxRatePercent: number;
  currency: string;
}

export const DEFAULT_PRICING: PricingConfig = {
  freeShippingThreshold: 99_900,
  flatShippingCharge: 4_900,
  taxRatePercent: 0,
  currency: 'INR',
};

/** Reads the (optional) overrides from the environment. */
export function resolvePricingConfig(env: NodeJS.ProcessEnv = process.env): PricingConfig {
  return {
    freeShippingThreshold: toNonNegativeInt(
      env.ORDER_FREE_SHIPPING_THRESHOLD,
      DEFAULT_PRICING.freeShippingThreshold,
    ),
    flatShippingCharge: toNonNegativeInt(
      env.ORDER_FLAT_SHIPPING_CHARGE,
      DEFAULT_PRICING.flatShippingCharge,
    ),
    taxRatePercent: Math.min(
      100,
      toNonNegativeInt(env.ORDER_TAX_RATE_PERCENT, DEFAULT_PRICING.taxRatePercent),
    ),
    currency: DEFAULT_PRICING.currency,
  };
}

export interface PricedLine {
  /** What the customer pays per unit, minor units. */
  unitPrice: number;
  /** List price per unit, minor units (for "was/now" and the discount column). */
  listPrice: number;
  quantity: number;
}

export interface Totals {
  subtotal: number;
  discountTotal: number;
  couponDiscount: number;
  shippingCharge: number;
  taxAmount: number;
  taxRatePercent: number;
  total: number;
}

/**
 * Computes the order totals.
 *
 * - `subtotal`  Σ list price × qty (the "before discount" figure an invoice shows)
 * - `discount`  Σ (list − charged) × qty, i.e. sale-price savings
 * - shipping    free at/above the threshold, otherwise a flat charge
 * - tax         only when `taxRatePercent > 0`, applied to the discounted goods value
 */
export function computeTotals(
  lines: PricedLine[],
  config: PricingConfig = DEFAULT_PRICING,
  couponDiscount = 0,
): Totals {
  const subtotal = lines.reduce((sum, line) => sum + line.listPrice * line.quantity, 0);
  const goodsValue = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const discountTotal = Math.max(0, subtotal - goodsValue);
  const coupon = clamp(couponDiscount, 0, goodsValue);

  const discountedGoods = Math.max(0, goodsValue - coupon);
  const shippingCharge =
    discountedGoods === 0 || discountedGoods >= config.freeShippingThreshold
      ? 0
      : config.flatShippingCharge;

  const taxAmount =
    config.taxRatePercent > 0
      ? Math.round((discountedGoods * config.taxRatePercent) / 100)
      : 0;

  return {
    subtotal,
    discountTotal,
    couponDiscount: coupon,
    shippingCharge,
    taxAmount,
    taxRatePercent: config.taxRatePercent,
    total: discountedGoods + shippingCharge + taxAmount,
  };
}

/** Per-line total, minor units. */
export function lineTotalOf(unitPrice: number, quantity: number, discount = 0): number {
  return Math.max(0, unitPrice * quantity - discount);
}

/** Sum of line totals — what is actually owed for goods. */
export function orderGoodsValue(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

function toNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
