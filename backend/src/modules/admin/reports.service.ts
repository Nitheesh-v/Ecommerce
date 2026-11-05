import { Injectable } from '@nestjs/common';
import type { DashboardQueryDto } from './dto/dashboard-query.dto.js';
import { CustomerInsightsRepository } from './repositories/customer-insights.repository.js';
import type {
  CustomerReportSummary,
  TopCustomerRow,
} from './repositories/customer-insights.repository.js';
import { DashboardRepository } from './repositories/dashboard.repository.js';
import type {
  CategorySalesPoint,
  StatusCount,
  TimeSeriesPoint,
  TopProductSummary,
} from './repositories/dashboard.repository.js';
import { fillDailySeries, resolveDateRange } from './utils/date-range.util.js';
import type { ResolvedRange } from './utils/date-range.util.js';

export interface SalesReportView {
  range: { key: string; label: string; from: string; to: string };
  totals: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    /** Catalogue and customer counts — current state, not range-bound. */
    products: number;
    customers: number;
  };
  revenueSeries: TimeSeriesPoint[];
  ordersSeries: TimeSeriesPoint[];
  statusMix: StatusCount[];
  categorySales: CategorySalesPoint[];
  topProducts: TopProductSummary[];
}

export interface CustomerReportView {
  range: { key: string; label: string; from: string; to: string };
  summary: CustomerReportSummary;
  topCustomers: TopCustomerRow[];
}

const TOP_PRODUCTS = 10;
const TOP_CUSTOMERS = 10;
const CATEGORY_LIMIT = 10;
const CRLF = '\r\n';

/**
 * Reports — sales and customers.
 *
 * Deliberately a *composition* layer: the sales report is the dashboard's own
 * aggregations (same repository, same definitions of revenue and average order
 * value), and the customer report adds the one thing the dashboard does not answer —
 * new vs repeat buyers. Nothing here re-derives money from line items; if a number
 * disagrees with the dashboard, it is the same query that changed.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly dashboard: DashboardRepository,
    private readonly customers: CustomerInsightsRepository,
  ) {}

  async salesReport(query: DashboardQueryDto): Promise<SalesReportView> {
    const range = resolveDateRange(query);

    const [metrics, revenueSeries, ordersSeries, statusMix, categorySales, topProducts] =
      await Promise.all([
        this.dashboard.getMetrics(range.from, range.to),
        this.dashboard.getRevenueSeries(range.from, range.to),
        this.dashboard.getOrdersSeries(range.from, range.to),
        this.dashboard.getOrderStatusDistribution(range.from, range.to),
        this.dashboard.getSalesByCategory(range.from, range.to, CATEGORY_LIMIT),
        this.dashboard.getTopProducts(range.from, range.to, TOP_PRODUCTS),
      ]);

    return {
      range: toRangeView(range),
      totals: {
        revenue: metrics.revenue,
        orders: metrics.orders,
        averageOrderValue: metrics.averageOrderValue,
        products: metrics.products,
        customers: metrics.customers,
      },
      revenueSeries: fillDailySeries(range, revenueSeries),
      ordersSeries: fillDailySeries(range, ordersSeries),
      statusMix,
      categorySales,
      topProducts,
    };
  }

  async customerReport(query: DashboardQueryDto): Promise<CustomerReportView> {
    const range = resolveDateRange(query);

    const [summary, topCustomers] = await Promise.all([
      this.customers.summary(range.from, range.to),
      this.customers.topCustomers(range.from, range.to, TOP_CUSTOMERS),
    ]);

    return {
      range: toRangeView(range),
      summary,
      topCustomers,
    };
  }

  /** Sales CSV: a totals block followed by the per-product table. */
  async salesCsv(query: DashboardQueryDto): Promise<string> {
    const report = await this.salesReport(query);
    const lines: string[] = [
      'Report,Sales',
      `Range,"${report.range.label}"`,
      `From,${report.range.from}`,
      `To,${report.range.to}`,
      '',
      'Metric,Value',
      `Revenue (minor units),${report.totals.revenue}`,
      `Orders,${report.totals.orders}`,
      `Average order value (minor units),${report.totals.averageOrderValue}`,
      `Active products,${report.totals.products}`,
      `Customers,${report.totals.customers}`,
      '',
      'Top products',
      'Product,Units sold,Revenue (minor units)',
      ...report.topProducts.map((row) =>
        [csvCell(row.name), row.unitsSold, row.revenue].join(','),
      ),
      '',
      'Sales by category',
      'Category,Orders,Revenue (minor units)',
      ...report.categorySales.map((row) =>
        [csvCell(row.category), row.orders, row.revenue].join(','),
      ),
      '',
      'Orders by status',
      'Status,Orders',
      ...report.statusMix.map((row) => [csvCell(row.status), row.count].join(',')),
    ];

    return lines.join(CRLF);
  }

  /** Customer CSV: the summary block followed by the top buyers. */
  async customersCsv(query: DashboardQueryDto): Promise<string> {
    const report = await this.customerReport(query);
    const lines: string[] = [
      'Report,Customers',
      `Range,"${report.range.label}"`,
      `From,${report.range.from}`,
      `To,${report.range.to}`,
      '',
      'Metric,Value',
      `New customers,${report.summary.newCustomers}`,
      `Repeat customers,${report.summary.repeatCustomers}`,
      `Active customers,${report.summary.activeCustomers}`,
      `Repeat rate (%),${report.summary.repeatRate}`,
      `Orders per customer,${report.summary.ordersPerCustomer}`,
      `Average order value (minor units),${report.summary.averageOrderValue}`,
      '',
      'Top customers',
      'Name,Email,Orders,Spend (minor units),Last order',
      ...report.topCustomers.map((row) =>
        [
          csvCell(row.name),
          csvCell(row.email),
          row.orders,
          row.spend,
          row.lastOrderAt ?? '',
        ].join(','),
      ),
    ];

    return lines.join(CRLF);
  }
}

function toRangeView(range: ResolvedRange) {
  return {
    key: range.range,
    label: range.label,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };
}

/** Quotes a cell when it contains a comma, quote or newline. */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
