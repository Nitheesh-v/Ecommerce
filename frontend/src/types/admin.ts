/**
 * Mirror of `DashboardOverview` from the NestJS API
 * (`backend/src/modules/admin/dashboard.service.ts`).
 *
 * Amounts are integer minor units (paise); format them with `formatCurrency`.
 */

export type DashboardRangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export interface DashboardMetrics {
  revenue: number;
  orders: number;
  products: number;
  customers: number;
  pendingOrders: number;
  lowStockProducts: number;
  averageOrderValue: number;
}

export interface TimeSeriesPoint {
  /** YYYY-MM-DD (UTC) */
  date: string;
  value: number;
}

export interface OrderStatusCount {
  status: string;
  count: number;
}

export interface CategorySalesPoint {
  category: string;
  revenue: number;
  orders: number;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

export interface TopProduct {
  id: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
}

export interface RecentCustomer {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface DashboardOverview {
  range: {
    key: DashboardRangeKey;
    from: string;
    to: string;
    label: string;
  };
  generatedAt: string;
  metrics: DashboardMetrics;
  revenueSeries: TimeSeriesPoint[];
  ordersSeries: TimeSeriesPoint[];
  orderStatusDistribution: OrderStatusCount[];
  salesByCategory: CategorySalesPoint[];
  recentOrders: RecentOrder[];
  topProducts: TopProduct[];
  lowStock: LowStockProduct[];
  recentCustomers: RecentCustomer[];
}
