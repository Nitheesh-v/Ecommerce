/** Mirrors of the admin customer API (`/api/admin/customers`). */

export type CustomerStatus = "active" | "suspended" | "deactivated";

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

/** Statuses an admin may move to from each state (mirrors the backend machine). */
export const CUSTOMER_STATUS_TRANSITIONS: Record<CustomerStatus, CustomerStatus[]> = {
  active: ["suspended", "deactivated"],
  suspended: ["active", "deactivated"],
  deactivated: ["active"],
};

export type CustomerSortField = "createdAt" | "netSpent" | "name";

export interface CustomerSpending {
  totalOrders: number;
  successfulOrders: number;
  /** Net of processed refunds, in minor units (paise). */
  totalSpent: number;
  refundedAmount: number;
  pendingRefundAmount: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  status: CustomerStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  metrics: CustomerSpending;
}

export interface CustomerStatusHistoryEntry {
  from: CustomerStatus;
  to: CustomerStatus;
  fromLabel: string;
  toLabel: string;
  reason?: string;
  note?: string;
  by: string | null;
  at: string;
}

export interface CustomerAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  orderNumber: string;
  lastUsedAt: string;
}

export interface CustomerActivityEntry {
  kind: "account_created" | "status_changed";
  label: string;
  detail?: string;
  at: string;
  by?: string | null;
}

export interface CustomerDetail extends Customer {
  statusHistory: CustomerStatusHistoryEntry[];
  addresses: CustomerAddress[];
  activity: CustomerActivityEntry[];
}

export interface CustomerOverview {
  totalCustomers: number;
  newThisMonth: number;
  active: number;
  suspended: number;
  deactivated: number;
  repeatCustomers: number;
  buyingCustomers: number;
  totalNetSpent: number;
  averageSpend: number;
  currency: string;
}

export interface CustomerListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: CustomerStatus;
  from?: string;
  to?: string;
  /** Minor units. */
  minSpent?: number;
  maxSpent?: number;
  hasOrders?: boolean;
  sortBy?: CustomerSortField;
  sortOrder?: "asc" | "desc";
}
