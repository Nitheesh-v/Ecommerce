/**
 * Customer-side analytics for the reports screen.
 *
 * Separate from `DashboardRepository` because it answers different questions: the
 * dashboard shows "how much did we sell", reports show "who bought, and how often".
 * Both read the same `orders` collection, so the numbers agree by construction.
 *
 * Money is minor units (paise), as everywhere else.
 */

export interface CustomerReportSummary {
  /** Customers whose *first ever* order fell inside the range. */
  newCustomers: number;
  /** Customers with more than one order inside the range. */
  repeatCustomers: number;
  /** Distinct customers who ordered inside the range. */
  activeCustomers: number;
  /** Repeat customers ÷ active customers, 0–100 with one decimal. */
  repeatRate: number;
  /** Average orders per active customer, one decimal. */
  ordersPerCustomer: number;
  /** Average order value across the range's non-cancelled orders, minor units. */
  averageOrderValue: number;
}

export interface TopCustomerRow {
  /** `null` for guest checkouts, which are keyed by email. */
  id: string | null;
  name: string;
  email: string;
  orders: number;
  /** Sum of non-cancelled order totals, minor units. */
  spend: number;
  lastOrderAt: string | null;
}

export abstract class CustomerInsightsRepository {
  abstract summary(from: Date, to: Date): Promise<CustomerReportSummary>;

  abstract topCustomers(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopCustomerRow[]>;
}
