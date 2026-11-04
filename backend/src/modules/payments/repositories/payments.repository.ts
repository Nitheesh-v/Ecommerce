import type { PaymentMethod } from '../../orders/schemas/order.schema.js';
import type {
  PaymentProvider,
  PaymentStatus,
} from '../schemas/payment.schema.js';

/** A stored gateway transaction, driver types flattened. */
export interface PaymentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string | null;
  customerEmail: string;
  customerName: string;
  /** Minor units (paise). */
  amount: number;
  currency: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
  gatewayStatus?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  signatureVerified: boolean;
  verifiedWithGateway: boolean;
  failureReason?: string;
  capturedAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;
  refundedAmount: number;
  pendingRefundAmount: number;
  latestEvent?: string;
  lastEventAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  customerEmail: string;
  customerName: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
}

export type PaymentSortField = 'createdAt' | 'amount';
export const PAYMENT_SORT_FIELDS: PaymentSortField[] = ['createdAt', 'amount'];

export interface PaymentListFilter {
  page: number;
  limit: number;
  /** Transaction id, gateway ids, order number, customer name or email. */
  search?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  /** Inclusive created-at window. */
  from?: Date;
  to?: Date;
  sortBy: PaymentSortField;
  sortOrder: 'asc' | 'desc';
}

/** Aggregates behind the five summary cards. All amounts in minor units. */
export interface PaymentSummaryRecord {
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

/** Fields a payment may move; the repository never changes gateway ids silently. */
export interface PaymentUpdate {
  status?: PaymentStatus;
  gatewayStatus?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  signatureVerified?: boolean;
  verifiedWithGateway?: boolean;
  /** `null` clears a previous failure, e.g. when a retry succeeds. */
  failureReason?: string | null;
  capturedAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;
  refundedAmount?: number;
  pendingRefundAmount?: number;
  latestEvent?: string;
  lastEventAt?: Date;
  method?: PaymentMethod;
}

export interface PaymentGuard {
  /** Only apply when the stored status is one of these (optimistic guard). */
  status?: PaymentStatus[];
}

/**
 * Persistence boundary for gateway transactions.
 *
 * The repository is an abstract class used as the DI token, so e2e tests can swap
 * in an implementation with the same guards and no database.
 */
export abstract class PaymentsRepository {
  abstract create(input: CreatePaymentInput): Promise<PaymentRecord>;

  abstract findById(id: string): Promise<PaymentRecord | null>;

  abstract findByGatewayOrderId(gatewayOrderId: string): Promise<PaymentRecord | null>;

  abstract findByGatewayPaymentId(gatewayPaymentId: string): Promise<PaymentRecord | null>;

  /** Latest attempt that can still complete (pending/authorized) for an order. */
  abstract findOpenForOrder(orderId: string): Promise<PaymentRecord | null>;

  /** Latest attempt that collected money (captured / refund states). */
  abstract findSettledForOrder(orderId: string): Promise<PaymentRecord | null>;

  abstract list(filter: PaymentListFilter): Promise<{ items: PaymentRecord[]; total: number }>;

  abstract summary(): Promise<PaymentSummaryRecord>;

  /** `null` means the guard failed (the payment moved in the meantime). */
  abstract update(
    id: string,
    guard: PaymentGuard,
    update: PaymentUpdate,
  ): Promise<PaymentRecord | null>;
}
