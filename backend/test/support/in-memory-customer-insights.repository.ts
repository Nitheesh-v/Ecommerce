import {
  CustomerInsightsRepository,
} from '../../src/modules/admin/repositories/customer-insights.repository.js';
import type {
  CustomerReportSummary,
  TopCustomerRow,
} from '../../src/modules/admin/repositories/customer-insights.repository.js';

const EMPTY: CustomerReportSummary = {
  newCustomers: 0,
  repeatCustomers: 0,
  activeCustomers: 0,
  repeatRate: 0,
  ordersPerCustomer: 0,
  averageOrderValue: 0,
};

/**
 * Deterministic customer analytics for e2e tests: an empty store unless a test
 * supplies fixtures through `summary` / `topCustomers`.
 */
export class InMemoryCustomerInsightsRepository implements CustomerInsightsRepository {
  constructor(
    private readonly overrides: Partial<CustomerInsightsRepository> = {},
    private readonly summaryFixture: CustomerReportSummary = EMPTY,
  ) {}

  summary(from: Date, to: Date): Promise<CustomerReportSummary> {
    return this.overrides.summary?.(from, to) ?? Promise.resolve(this.summaryFixture);
  }

  topCustomers(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopCustomerRow[]> {
    return (
      this.overrides.topCustomers?.(from, to, limit) ?? Promise.resolve([] as TopCustomerRow[])
    );
  }
}
