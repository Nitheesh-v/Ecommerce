import type {
  HistoryKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
  ReturnStatus,
  ShippingMethod,
} from '../schemas/order.schema.js';

/** Someone who acted on the order (admin for console actions, customer otherwise). */
export interface OrderActor {
  userId?: string;
  email?: string;
}

export interface OrderItemRecord {
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  /** Price actually charged, minor units. */
  unitPrice: number;
  /** List price at purchase time, minor units. */
  listPrice: number;
  /** `(listPrice − unitPrice) × quantity`. */
  discount: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderAddressRecord {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface RefundRecord {
  refundId: string;
  amount: number;
  status: RefundStatus;
  reason: string;
  reference?: string;
  /** Gateway refund id (`rfnd_…`) when a payment gateway executed it. */
  gatewayRefundId?: string;
  /** `gateway` = executed by Razorpay, `manual` = bank transfer / cash. */
  source?: 'gateway' | 'manual';
  requestedAt: Date;
  requestedBy?: OrderActor | null;
  processedAt?: Date;
  processedBy?: OrderActor | null;
  note?: string;
}

export interface ReturnItemRecord {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface ReturnRecord {
  returnId: string;
  status: ReturnStatus;
  reason: string;
  note?: string;
  items: ReturnItemRecord[];
  refundableAmount: number;
  inspectionNotes?: string;
  inspectionPassed?: boolean;
  restockApproved: boolean;
  restockedAt?: Date;
  refundId?: string;
  requestedAt: Date;
  requestedBy?: OrderActor | null;
  decidedAt?: Date;
  decidedBy?: OrderActor | null;
  decisionNote?: string;
}

export interface CancellationRecord {
  reason: string;
  note?: string;
  cancelledAt: Date;
  cancelledBy?: OrderActor | null;
  restocked: boolean;
  restockedAt?: Date;
}

export interface HistoryRecord {
  kind: HistoryKind;
  from?: string;
  to?: string;
  reason?: string;
  note?: string;
  by?: OrderActor | null;
  at: Date;
}

export interface ShippingRecord {
  provider?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: Date;
  estimatedDelivery?: Date;
  deliveredAt?: Date;
  notes: Array<{ note: string; at: Date; by?: string }>;
}

/** A stored order, driver types flattened to strings/dates for the service layer. */
export interface OrderRecord {
  id: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderItemRecord[];
  subtotal: number;
  discountTotal: number;
  couponCode?: string;
  couponDiscount: number;
  shippingCharge: number;
  taxAmount: number;
  taxRatePercent: number;
  total: number;
  currency: string;
  shippingAddress: OrderAddressRecord;
  shippingMethod: ShippingMethod;
  shipping?: ShippingRecord;
  payment: {
    method: PaymentMethod;
    transactionId?: string;
    paidAmount: number;
    paidAt?: Date;
    refunds: RefundRecord[];
  };
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  cancellation?: CancellationRecord;
  returns: ReturnRecord[];
  history: HistoryRecord[];
  idempotencyKey?: string;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInput {
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: Array<Omit<OrderItemRecord, 'imageUrl'> & { imageUrl?: string | null }>;
  subtotal: number;
  discountTotal: number;
  couponCode?: string;
  couponDiscount: number;
  shippingCharge: number;
  taxAmount: number;
  taxRatePercent: number;
  total: number;
  currency: string;
  shippingAddress: OrderAddressRecord;
  shippingMethod: ShippingMethod;
  payment: { method: PaymentMethod; paidAmount: number; paidAt?: Date; transactionId?: string };
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  history: HistoryRecord[];
  idempotencyKey?: string;
}

export const ORDER_SORT_FIELDS = ['createdAt', 'total'] as const;
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

export interface OrderListFilter {
  page: number;
  limit: number;
  /** Matches order number, customer name or email. */
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  /** Inclusive created-at window. */
  from?: Date;
  to?: Date;
  sortBy: OrderSortField;
  sortOrder: 'asc' | 'desc';
  /** Restricts to one customer (customer-facing reads). */
  userId?: string;
}

/** The (small) set of mutations the service is allowed to perform. */
export interface OrderUpdate {
  /** Plain fields or dotted paths (`'shipping.trackingNumber'`). */
  set?: Record<string, unknown>;
  /** Append-only audit entries written in the same atomic operation. */
  pushHistory?: HistoryRecord[];
  pushReturn?: ReturnRecord;
}

/**
 * Persistence boundary for orders.
 *
 * Mutations go through `apply()` which takes an **optimistic guard** (the statuses
 * this update is valid from, or the id of a specific return). Mongo applies the
 * guard and the write in one `findOneAndUpdate`, so two admins clicking
 * "Ship" simultaneously produce one transition and one conflict instead of two
 * history entries. Append-only `history` is written in the same operation.
 */
export abstract class OrdersRepository {
  /** Next `ORD-YYYYMMDD-NNNN` for the given day (atomic counter). */
  abstract nextOrderNumber(now?: Date): Promise<string>;

  /** `null` when the idempotency key already belongs to an order. */
  abstract create(input: CreateOrderInput): Promise<OrderRecord | null>;

  abstract findById(id: string): Promise<OrderRecord | null>;

  abstract findByIdempotencyKey(key: string): Promise<OrderRecord | null>;

  abstract list(filter: OrderListFilter): Promise<{ items: OrderRecord[]; total: number }>;

  /**
   * Atomic guarded update. `null` means "guard failed" (status already changed,
   * return no longer exists) — the service turns that into a 409.
   */
  abstract apply(
    id: string,
    guard: { status?: OrderStatus[]; returnId?: string; paymentStatus?: PaymentStatus[] },
    update: OrderUpdate,
  ): Promise<OrderRecord | null>;
}
