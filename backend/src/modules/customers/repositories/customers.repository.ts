import type { CustomerStatus } from '../../users/customer-status.js';
import type { StatusHistoryEntry } from '../../users/repositories/users.repository.js';

/**
 * Admin-side read model for customers.
 *
 * There is **no** `customers` collection: a customer is a `users` document
 * (`role: 'customer'`) whose spending figures are derived from the `orders`
 * collection. This repository is the only place that joins the two, so the join
 * happens once (aggregation) instead of once per row.
 *
 * It is read-only: every write to a user (including status changes) still goes
 * through `UsersRepository`, which owns the schema.
 */

/** Spending and order figures for one customer. */
export interface CustomerMetrics {
  /** Every order ever placed, whatever its status. */
  totalOrders: number;
  /** Orders where money was actually collected and the sale was not called off. */
  successfulOrders: number;
  /** Net of processed refunds (see `orders/spending.ts`). */
  netSpent: number;
  /** Refunds already paid out. */
  refundedAmount: number;
  /** Refunds queued but not paid out yet — reported, never subtracted twice. */
  pendingRefundAmount: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  /** Phone from the most recent order, used when the account has none. */
  lastOrderPhone?: string;
}

export const EMPTY_METRICS: CustomerMetrics = {
  totalOrders: 0,
  successfulOrders: 0,
  netSpent: 0,
  refundedAmount: 0,
  pendingRefundAmount: 0,
  firstOrderAt: null,
  lastOrderAt: null,
};

export interface CustomerRecord {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  status: CustomerStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
  metrics: CustomerMetrics;
}

/** A shipping address taken from an order snapshot. */
export interface CustomerAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Where it was first seen and when it was last used. */
  orderNumber: string;
  lastUsedAt: Date;
}

export type CustomerSortField = 'createdAt' | 'netSpent' | 'name';

export interface CustomerListFilter {
  page: number;
  limit: number;
  /** Name, email or phone. */
  search?: string;
  status?: CustomerStatus;
  /** Registration-date window. */
  from?: Date;
  to?: Date;
  /** Spending window in minor units. */
  minSpent?: number;
  maxSpent?: number;
  /** `true` = only customers with at least one successful purchase. */
  hasOrders?: boolean;
  sortBy: CustomerSortField;
  sortOrder: 'asc' | 'desc';
}

/** Aggregate across all customer accounts (real data, not projections). */
export interface CustomerOverview {
  totalCustomers: number;
  newThisMonth: number;
  active: number;
  suspended: number;
  deactivated: number;
  /** Customers with two or more successful purchases. */
  repeatCustomers: number;
  /** Customers with at least one successful purchase. */
  buyingCustomers: number;
  totalNetSpent: number;
  /** `totalNetSpent / buyingCustomers`, in minor units. */
  averageSpend: number;
}

export abstract class CustomersRepository {
  abstract list(
    filter: CustomerListFilter,
  ): Promise<{ items: CustomerRecord[]; total: number }>;

  /** One customer with the same derived metrics as the list. */
  abstract findById(id: string): Promise<CustomerRecord | null>;

  /** Org-wide customer analytics. */
  abstract overview(now?: Date): Promise<CustomerOverview>;

  /** Distinct shipping addresses captured on the customer's orders, newest first. */
  abstract addresses(id: string): Promise<CustomerAddress[]>;
}
