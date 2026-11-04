/**
 * Order types.
 *
 * Everything price-related is an integer in minor units (paise) and comes from
 * the server. The UI formats; it never computes a total, a tax or a shipping fee.
 */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "return_requested"
  | "returned";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refund_pending"
  | "partially_refunded"
  | "refunded";

export type PaymentMethod = "cod" | "card" | "upi" | "netbanking" | "wallet" | "manual";

export type ShippingMethod = "standard" | "express" | "same_day" | "pickup";

export type RefundStatus = "pending" | "processed" | "failed";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "inspected"
  | "restocked"
  | "refunded";

export type HistoryKind =
  | "status"
  | "payment"
  | "shipping"
  | "cancellation"
  | "return"
  | "refund"
  | "note";

export type OrderSortField = "createdAt" | "total";

export interface OrderActor {
  userId?: string;
  email?: string;
}

export interface OrderItem {
  productId: string;
  /** Purchase-time snapshot: unaffected by later product edits. */
  name: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  listPrice: number;
  discount: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderRefund {
  refundId: string;
  amount: number;
  status: RefundStatus;
  reason: string;
  reference?: string;
  requestedAt: string;
  requestedBy?: OrderActor | null;
  processedAt?: string;
  processedBy?: OrderActor | null;
  note?: string;
}

export interface OrderReturnItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderReturn {
  returnId: string;
  status: ReturnStatus;
  reason: string;
  note?: string;
  items: OrderReturnItem[];
  refundableAmount: number;
  inspectionNotes?: string;
  inspectionPassed?: boolean;
  restockApproved: boolean;
  restockedAt?: string;
  refundId?: string;
  requestedAt: string;
  requestedBy?: OrderActor | null;
  decidedAt?: string;
  decidedBy?: OrderActor | null;
  decisionNote?: string;
}

export interface OrderHistoryEntry {
  kind: HistoryKind;
  from?: string;
  to?: string;
  reason?: string;
  note?: string;
  by?: OrderActor | null;
  at: string;
}

export interface OrderShipping {
  provider?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: string;
  estimatedDelivery?: string;
  deliveredAt?: string;
  notes: Array<{ note: string; at: string; by?: string }>;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  couponCode?: string;
  couponDiscount: number;
  shippingCharge: number;
  taxAmount: number;
  taxRatePercent: number;
  total: number;
  currency: string;
  shippingAddress: OrderAddress;
  shippingMethod: ShippingMethod;
  shipping?: OrderShipping;
  payment: {
    method: PaymentMethod;
    transactionId?: string;
    paidAmount: number;
    paidAt?: string;
    refunds: OrderRefund[];
  };
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  cancellation?: {
    reason: string;
    note?: string;
    cancelledAt: string;
    cancelledBy?: OrderActor | null;
    restocked: boolean;
    restockedAt?: string;
  };
  returns: OrderReturn[];
  history: OrderHistoryEntry[];
  idempotencyKey?: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // ---- derived by the API
  itemCount: number;
  refundedAmount: number;
  pendingRefundAmount: number;
  balanceDue: number;
  allowedNextStatuses: OrderStatus[];
  canCancel: boolean;
  canRequestReturn: boolean;
  activeReturn: OrderReturn | null;
}

export interface OrderListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  from?: string;
  to?: string;
  sortBy?: OrderSortField;
  sortOrder?: "asc" | "desc";
}

export interface InvoiceLine {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface Invoice {
  invoiceNumber: string;
  issuedAt: string;
  orderNumber: string;
  currency: string;
  store: {
    name: string;
    legalName: string;
    email: string;
    phone: string;
    website: string;
    addressLines: string[];
    gstin?: string;
  };
  customer: {
    name: string;
    email: string;
    phone?: string;
    billingAddress: OrderAddress;
  };
  lines: InvoiceLine[];
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
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  returned: "Returned",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refund_pending: "Refund pending",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  standard: "Standard delivery",
  express: "Express delivery",
  same_day: "Same-day delivery",
  pickup: "Store pickup",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: "Cash on delivery",
  card: "Card",
  upi: "UPI",
  netbanking: "Net banking",
  wallet: "Wallet",
  manual: "Manual / bank transfer",
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received",
  inspected: "Inspected",
  restocked: "Restocked",
  refunded: "Refunded",
};

/** Happy-path steps rendered in the fulfilment stepper. */
export const FULFILMENT_STEPS: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

export const CANCELLATION_REASONS = [
  "Customer requested cancellation",
  "Payment failed",
  "Out of stock",
  "Pricing error",
  "Suspected fraud",
  "Other",
];
