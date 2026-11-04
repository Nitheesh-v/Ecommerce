import type { OrderRecord } from './repositories/orders.repository.js';

/** Who the invoice is from. Overridable per deployment via environment variables. */
export interface StoreProfile {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  addressLines: string[];
  gstin?: string;
}

export const DEFAULT_STORE_PROFILE: StoreProfile = {
  name: 'Arena Store',
  legalName: 'Arena Commerce Pvt. Ltd.',
  email: 'support@arena-store.example',
  phone: '+91 90000 00000',
  website: 'https://arena-store.example',
  addressLines: ['12 Market Road', 'Coimbatore, Tamil Nadu 641001', 'India'],
};

export function resolveStoreProfile(env: NodeJS.ProcessEnv = process.env): StoreProfile {
  return {
    name: env.STORE_NAME?.trim() || DEFAULT_STORE_PROFILE.name,
    legalName: env.STORE_LEGAL_NAME?.trim() || DEFAULT_STORE_PROFILE.legalName,
    email: env.STORE_EMAIL?.trim() || DEFAULT_STORE_PROFILE.email,
    phone: env.STORE_PHONE?.trim() || DEFAULT_STORE_PROFILE.phone,
    website: env.STORE_WEBSITE?.trim() || DEFAULT_STORE_PROFILE.website,
    addressLines: env.STORE_ADDRESS
      ? env.STORE_ADDRESS.split('|').map((line) => line.trim()).filter(Boolean)
      : DEFAULT_STORE_PROFILE.addressLines,
    gstin: env.STORE_GSTIN?.trim() || undefined,
  };
}

/**
 * Everything printed on an invoice.
 *
 * Built **only** from the stored order — product names, SKUs, prices and the
 * customer's address are the purchase-time snapshots. Editing a product or a
 * customer profile afterwards therefore cannot change a historical invoice, and
 * re-downloading an invoice always yields the same document (same number, same
 * issue date, same amounts).
 */
export interface InvoiceView {
  invoiceNumber: string;
  /** Issue date = order placement date, so a re-issue is byte-for-byte stable. */
  issuedAt: string;
  orderNumber: string;
  currency: string;
  store: StoreProfile;
  customer: {
    name: string;
    email: string;
    phone?: string;
    billingAddress: OrderRecord['shippingAddress'];
  };
  lines: Array<{
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }>;
  totals: {
    subtotal: number;
    discountTotal: number;
    couponCode?: string;
    couponDiscount: number;
    shippingCharge: number;
    taxAmount: number;
    taxRatePercent: number;
    total: number;
    paidAmount: number;
    refundedAmount: number;
    balance: number;
  };
  payment: {
    method: string;
    status: string;
    transactionId?: string;
    paidAt?: string;
  };
  notes?: string;
}

export function buildInvoice(
  order: OrderRecord,
  store: StoreProfile = resolveStoreProfile(),
): InvoiceView {
  const refundedAmount = order.payment.refunds
    .filter((refund) => refund.status === 'processed')
    .reduce((sum, refund) => sum + refund.amount, 0);

  return {
    // Derived from the order number: an invoice number can never drift from the
    // order it documents.
    invoiceNumber: `INV-${order.orderNumber}`,
    issuedAt: order.createdAt.toISOString(),
    orderNumber: order.orderNumber,
    currency: order.currency,
    store,
    customer: {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
      billingAddress: order.shippingAddress,
    },
    lines: order.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      lineTotal: item.lineTotal,
    })),
    totals: {
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      couponCode: order.couponCode,
      couponDiscount: order.couponDiscount,
      shippingCharge: order.shippingCharge,
      taxAmount: order.taxAmount,
      taxRatePercent: order.taxRatePercent,
      total: order.total,
      paidAmount: order.payment.paidAmount,
      refundedAmount,
      balance: Math.max(0, order.total - order.payment.paidAmount),
    },
    payment: {
      method: order.payment.method,
      status: order.paymentStatus,
      transactionId: order.payment.transactionId,
      paidAt: order.payment.paidAt?.toISOString(),
    },
  };
}
