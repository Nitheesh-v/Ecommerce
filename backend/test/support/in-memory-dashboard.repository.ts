import type {
  CategorySalesPoint,
  DashboardMetrics,
  DashboardRepository,
  LowStockSummary,
  RecentCustomerSummary,
  RecentOrderSummary,
  StatusCount,
  TimeSeriesPoint,
  TopProductSummary,
} from '../../src/modules/admin/repositories/dashboard.repository.js';

const EMPTY_METRICS: DashboardMetrics = {
  revenue: 0,
  orders: 0,
  products: 0,
  customers: 0,
  pendingOrders: 0,
  lowStockProducts: 0,
  averageOrderValue: 0,
};

/**
 * Deterministic dashboard data for e2e tests.
 *
 * Defaults mirror an empty store (zeros / empty arrays) so the dashboard's empty
 * states can be asserted; individual sections are overridable per test.
 */
export class InMemoryDashboardRepository implements DashboardRepository {
  constructor(
    private readonly overrides: Partial<DashboardRepository> = {},
    private readonly metrics: DashboardMetrics = EMPTY_METRICS,
  ) {}

  getMetrics(from: Date, to: Date): Promise<DashboardMetrics> {
    return this.overrides.getMetrics?.(from, to) ?? Promise.resolve(this.metrics);
  }

  getRevenueSeries(from: Date, to: Date): Promise<TimeSeriesPoint[]> {
    return this.overrides.getRevenueSeries?.(from, to) ?? Promise.resolve([]);
  }

  getOrdersSeries(from: Date, to: Date): Promise<TimeSeriesPoint[]> {
    return this.overrides.getOrdersSeries?.(from, to) ?? Promise.resolve([]);
  }

  getOrderStatusDistribution(from: Date, to: Date): Promise<StatusCount[]> {
    return this.overrides.getOrderStatusDistribution?.(from, to) ?? Promise.resolve([]);
  }

  getSalesByCategory(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<CategorySalesPoint[]> {
    return (
      this.overrides.getSalesByCategory?.(from, to, limit) ?? Promise.resolve([])
    );
  }

  getTopProducts(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopProductSummary[]> {
    return this.overrides.getTopProducts?.(from, to, limit) ?? Promise.resolve([]);
  }

  getLowStock(limit: number): Promise<LowStockSummary[]> {
    return this.overrides.getLowStock?.(limit) ?? Promise.resolve([]);
  }

  getRecentOrders(limit: number): Promise<RecentOrderSummary[]> {
    return this.overrides.getRecentOrders?.(limit) ?? Promise.resolve([]);
  }

  getRecentCustomers(limit: number): Promise<RecentCustomerSummary[]> {
    return this.overrides.getRecentCustomers?.(limit) ?? Promise.resolve([]);
  }
}
