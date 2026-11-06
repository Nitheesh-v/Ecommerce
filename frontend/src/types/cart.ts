// src/types/cart.ts

/**
 * Mirrors of the cart and checkout API (`/api/cart`, `/api/checkout`).
 *
 * Every amount is an **integer in minor units (paise)** and every amount is
 * computed by the server: nothing in these types is ever sent back as a price.
 */

export type CouponType = "percentage" | "fixed" | "free_shipping";

/** The price breakdown the server returns with every cart read. */
export interface CartTotals {
  /** Units that can actually be bought (unavailable lines are excluded). */
  itemCount: number;
  /** List-price value before any discount. */
  subtotal: number;
  /** What the goods cost after sale prices, before a coupon. */
  goodsValue: number;
  /** Sale-price savings (list minus charged). */
  discountTotal: number;
  couponDiscount: number;
  shippingCharge: number;
  taxAmount: number;
  taxRatePercent: number;
  total: number;
  currency: string;
  freeShippingThreshold: number;
  /** Spend still needed to reach free shipping (`0` once reached). */
  freeShippingGap: number;
}

export interface CartItem {
  productId: string;
  name: string;
  slug: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  /** Live price per unit — never the add-time snapshot. */
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
  stock: number;
  /** `false` for a draft/archived/out-of-stock product; it stays visible but unpriced. */
  available: boolean;
  unavailableReason: string | null;
}

export interface AppliedCoupon {
  code: string;
  name: string;
  type: CouponType;
  summary: string;
  discount: number;
  freeShipping: boolean;
}

export interface Cart {
  items: CartItem[];
  totals: CartTotals;
  coupon: AppliedCoupon | null;
  /** Set once when a stored coupon stopped applying — it is already removed. */
  couponIssue: string | null;
  unavailableCount: number;
  updatedAt: string | null;
}

/** `cod` pays at the door; `online` opens the gateway. */
export type CheckoutPaymentMethod = "cod" | "online";

export interface CheckoutAddress {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CheckoutPaymentOptions {
  codAvailable: boolean;
  /** Highest total COD will accept, minor units; `0` means no cap. */
  codMaxAmount: number;
  onlineAvailable: boolean;
  currency: string;
}

export interface CheckoutLine {
  productId: string;
  name: string;
  slug: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
}

/** `POST /api/checkout/preview` — a dry run that writes nothing. */
export interface CheckoutPreview {
  items: CheckoutLine[];
  totals: CartTotals;
  coupon: AppliedCoupon | null;
  address: CheckoutAddress;
  paymentMethod: CheckoutPaymentMethod;
  paymentOptions: CheckoutPaymentOptions;
  shippingMethod: "standard";
  estimatedDelivery: string;
}

/** The gateway hand-off returned by `POST /api/checkout/place` for online orders. */
export interface CheckoutPaymentHandoff {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  testMode: boolean;
  prefill: { name: string; email: string; contact?: string };
}

/** `POST /api/checkout/place` */
export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  paymentMethod: CheckoutPaymentMethod;
  status: string;
  paymentStatus: string;
  requiresPayment: boolean;
  paymentUrl: string | null;
  totals: {
    subtotal: number;
    couponDiscount: number;
    discountTotal: number;
    taxAmount: number;
    shippingCharge: number;
    total: number;
    currency: string;
  };
  payment: CheckoutPaymentHandoff | null;
  /** `false` when an idempotent retry returned the order it already created. */
  created: boolean;
}

/** `POST /api/checkout/verify-payment` */
export interface PaymentConfirmation {
  verified: boolean;
  orderId: string;
  orderNumber: string;
  paymentStatus: string;
  statusLabel: string;
  orderStatus: string | null;
  total: number;
  currency: string;
}
