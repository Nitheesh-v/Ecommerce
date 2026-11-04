import { Injectable } from '@nestjs/common';
import type { DashboardQueryDto } from './dto/dashboard-query.dto.js';
import type {
  CategorySalesPoint,
  DashboardMetrics,
  LowStockSummary,
  RecentCustomerSummary,
  RecentOrderSummary,
  StatusCount,
  TimeSeriesPoint,
  TopProductSummary,
} from './repositories/dashboard.repository.js';
import { DashboardRepository } from './repositories/dashboard.repository.js';
import { fillDailySeries, resolveDateRange } from './utils/date-range.util.js';

export interface DashboardOverview {
  range: {
    key: string;
    from: string;
    to: string;
    label: string;
  };
  generatedAt: string;
  metrics: DashboardMetrics;
  revenueSeries: TimeSeriesPoint[];
  ordersSeries: TimeSeriesPoint[];
  orderStatusDistribution: StatusCount[];
  salesByCategory: CategorySalesPoint[];
  recentOrders: RecentOrderSummary[];
  topProducts: TopProductSummary[];
  lowStock: LowStockSummary[];
  recentCustomers: RecentCustomerSummary[];
}

const LIST_LIMIT = 5;
const CATEGORY_LIMIT = 6;

/**
 * Composes the dashboard payload in one round trip.
 *
 * A dashboard that needs six endpoints to render is six chances to show a
 * half-loaded screen; a single `overview` call is simpler for the client and
 * lets the database run the independent aggregations concurrently.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getOverview(query: DashboardQueryDto): Promise<DashboardOverview> {
    const range = resolveDateRange({
      range: query.range,
      from: query.from,
      to: query.to,
    });

    const [
      metrics,
      revenueSeries,
      ordersSeries,
      orderStatusDistribution,
      salesByCategory,
      recentOrders,
      topProducts,
      lowStock,
      recentCustomers,
    ] = await Promise.all([
      this.dashboardRepository.getMetrics(range.from, range.to),
      this.dashboardRepository.getRevenueSeries(range.from, range.to),
      this.dashboardRepository.getOrdersSeries(range.from, range.to),
      this.dashboardRepository.getOrderStatusDistribution(range.from, range.to),
      this.dashboardRepository.getSalesByCategory(range.from, range.to, CATEGORY_LIMIT),
      this.dashboardRepository.getRecentOrders(LIST_LIMIT),
      this.dashboardRepository.getTopProducts(range.from, range.to, LIST_LIMIT),
      this.dashboardRepository.getLowStock(LIST_LIMIT),
      this.dashboardRepository.getRecentCustomers(LIST_LIMIT),
    ]);

    return {
      range: {
        key: range.range,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        label: range.label,
      },
      generatedAt: new Date().toISOString(),
      metrics,
      // Gap-filled so a chart never interpolates over a day with no sales.
      revenueSeries: fillDailySeries(range, revenueSeries),
      ordersSeries: fillDailySeries(range, ordersSeries),
      orderStatusDistribution,
      salesByCategory,
      recentOrders,
      topProducts,
      lowStock,
      recentCustomers,
    };
  }
}
