import type {
  CategorySalesPoint,
  DashboardRangeKey,
  OrderStatusCount,
  TimeSeriesPoint,
  TopProduct,
} from "@/types/admin";

/** Every report echoes the window it covers, so the screen can label itself. */
export interface ReportRange {
  key: DashboardRangeKey;
  label: string;
  from: string;
  to: string;
}

export interface SalesReportTotals {
  revenue: number;
  orders: number;
  averageOrderValue: number;
  /** Current catalogue/customer counts, not range-bound. */
  products: number;
  customers: number;
}

export interface SalesReport {
  range: ReportRange;
  totals: SalesReportTotals;
  revenueSeries: TimeSeriesPoint[];
  ordersSeries: TimeSeriesPoint[];
  statusMix: OrderStatusCount[];
  categorySales: CategorySalesPoint[];
  topProducts: TopProduct[];
}

export interface CustomerReportSummary {
  newCustomers: number;
  repeatCustomers: number;
  activeCustomers: number;
  /** 0–100 with one decimal. */
  repeatRate: number;
  ordersPerCustomer: number;
  averageOrderValue: number;
}

export interface TopCustomerRow {
  /** `null` for guest checkouts, which are keyed by email. */
  id: string | null;
  name: string;
  email: string;
  orders: number;
  spend: number;
  lastOrderAt: string | null;
}

export interface CustomerReport {
  range: ReportRange;
  summary: CustomerReportSummary;
  topCustomers: TopCustomerRow[];
}

export type ReportTab = "sales" | "customers";
