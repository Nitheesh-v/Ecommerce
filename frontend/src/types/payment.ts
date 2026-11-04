/**
 * Mirrors of the payment API (`/api/payments`, `/api/admin/payments`).
 *
 * All amounts are integers in minor units (paise); the UI formats, never computes.
 * There is intentionally no "set status" shape anywhere: payment state is a server
 * (gateway-verified) concern.
 */

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  authorized: "Authorized",
  captured: "Captured",
  failed: "Failed",
  cancelled: "Cancelled",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const PAYMENT_STATUS_OPTIONS: Array<{ value: PaymentStatus; label: string }> = (
  Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]
).map((value) => ({ value, label: PAYMENT_STATUS_LABELS[value] }));

export type PaymentMethod =
  | "cod"
  | "card"
  | "upi"
  | "netbanking"
  | "wallet"
  | "manual";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: "Cash on delivery",
  card: "Card",
  upi: "UPI",
  netbanking: "Net banking",
  wallet: "Wallet",
  manual: "Manual / bank transfer",
};

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = (
  Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]
).map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: {
    userId: string | null;
    name: string;
    email: string;
  };
  amount: number;
  currency: string;
  method: PaymentMethod;
  methodLabel: string;
  provider: string;
  status: PaymentStatus;
  statusLabel: string;
  /** `true` while the console is running against Razorpay test keys. */
  testMode: boolean;
  gateway: {
    orderId: string | null;
    paymentId: string | null;
    signatureVerified: boolean;
    verifiedWithGateway: boolean;
  };
  failureReason: string | null;
  refundedAmount: number;
  pendingRefundAmount: number;
  refundableAmount: number;
  capturedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRefund {
  refundId: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  reason: string;
  reference?: string;
  gatewayRefundId?: string;
  source: "gateway" | "manual";
  requestedAt: string;
  processedAt: string | null;
  note?: string;
}

export interface PaymentEvent {
  id: string;
  type: string;
  label: string;
  source: string;
  message: string;
  gatewayReference: string | null;
  at: string;
}

export interface PaymentTimelineEntry {
  id: string;
  kind: "payment" | "refund" | "order";
  label: string;
  detail?: string;
  at: string;
  actor?: string | null;
}

export interface PaymentOrder {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  total: number;
  currency: string;
  createdAt: string;
  items: Array<{ name: string; sku: string; quantity: number; lineTotal: number }>;
  shippingAddress: {
    recipientName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  customer: { name: string; email: string; phone?: string };
}

export interface PaymentDetail extends Payment {
  order: PaymentOrder;
  refunds: PaymentRefund[];
  events: PaymentEvent[];
  timeline: PaymentTimelineEntry[];
}

export interface PaymentSummary {
  totalCount: number;
  totalAmount: number;
  successfulCount: number;
  successfulAmount: number;
  pendingCount: number;
  pendingAmount: number;
  failedCount: number;
  failedAmount: number;
  refundedAmount: number;
  currency: string;
}

export type PaymentSortField = "createdAt" | "amount";

export interface PaymentListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  sortBy?: PaymentSortField;
  sortOrder?: "asc" | "desc";
}

/** What the browser receives before opening the checkout widget. */
export interface CheckoutSession {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: "razorpay" | "disabled";
  keyId: string | null;
  testMode: boolean;
  gatewayOrderId: string;
  status: PaymentStatus;
  prefill: { name: string; email: string; contact?: string };
  notes: Record<string, string>;
}

export interface CheckoutConfig {
  provider: "razorpay" | "disabled";
  enabled: boolean;
  testMode: boolean;
  keyId: string | null;
  currency: string;
  webhooksEnabled: boolean;
}

export interface VerifyPaymentResult {
  verified: boolean;
  status: PaymentStatus;
  statusLabel: string;
  payment: Payment;
  order: PaymentOrder | null;
}

export interface RefundPaymentResult {
  refund: PaymentRefund;
  payment: Payment;
}
