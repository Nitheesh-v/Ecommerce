/**
 * Everything the dashboard can read, independent of the storage engine.
 *
 * Amounts are in **minor currency units** (paise), matching the project rule of
 * never storing money as a float. The client formats them with `Intl.NumberFormat`.
 */

export interface DashboardMetrics {
  /** Sum of paid orders inside the range (minor units). */
  revenue: number;
  /** Orders created inside the range. */
  orders: number;
  /** Products that are not archived (current state, not range-bound). */
  products: number;
  /** Customer accounts (current state). */
  customers: number;
  /** Orders waiting to be confirmed (current backlog). */
  pendingOrders: number;
  /** Products at or below their low-stock threshold (current state). */
  lowStockProducts: number;
  /** `revenue / paidOrderCount`, in minor units. */
  averageOrderValue: number;
}

export interface TimeSeriesPoint {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  value: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface CategorySalesPoint {
  category: string;
  revenue: number;
  orders: number;
}

export interface RecentOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

export interface TopProductSummary {
  id: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface LowStockSummary {
  id: string;
  name: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
}

export interface RecentCustomerSummary {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/**
 * Read side of the dashboard.
 *
 * Declared as an abstract class so it doubles as the Nest DI token, exactly like
 * the other repositories in this project — which is also what lets the e2e suite
 * substitute deterministic data without a database.
 */
export abstract class DashboardRepository {
  abstract getMetrics(from: Date, to: Date): Promise<DashboardMetrics>;
  abstract getRevenueSeries(from: Date, to: Date): Promise<TimeSeriesPoint[]>;
  abstract getOrdersSeries(from: Date, to: Date): Promise<TimeSeriesPoint[]>;
  abstract getOrderStatusDistribution(from: Date, to: Date): Promise<StatusCount[]>;
  abstract getSalesByCategory(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<CategorySalesPoint[]>;
  abstract getTopProducts(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopProductSummary[]>;
  abstract getLowStock(limit: number): Promise<LowStockSummary[]>;
  abstract getRecentOrders(limit: number): Promise<RecentOrderSummary[]>;
  abstract getRecentCustomers(limit: number): Promise<RecentCustomerSummary[]>;
}
