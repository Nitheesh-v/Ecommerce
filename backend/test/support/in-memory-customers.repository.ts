import { Role } from '../../src/common/enums/role.enum.js';
import type {
  CustomerAddress,
  CustomerListFilter,
  CustomerOverview,
  CustomerRecord,
  CustomersRepository,
} from '../../src/modules/customers/repositories/customers.repository.js';
import {
  isSuccessfulPurchase,
  orderNetSpent,
  pendingRefundsTotal,
  processedRefundsTotal,
} from '../../src/modules/orders/spending.js';
import type { OrderRecord } from '../../src/modules/orders/repositories/orders.repository.js';
import type { UserRecord } from '../../src/modules/users/repositories/users.repository.js';
import type { InMemoryOrdersRepository } from './in-memory-orders.repository.js';
import type { InMemoryUsersRepository } from './in-memory-users.repository.js';

/**
 * In-memory stand-in for the customer read model.
 *
 * It deliberately uses the **same spending helpers** as production
 * (`orders/spending.ts`), so a bug in the definition shows up in tests instead of
 * hiding behind a hand-written fake. Only the Mongo-side aggregation is untested
 * by e2e (no database in CI) — that pipeline mirrors these helpers line by line.
 */
export class InMemoryCustomersRepository implements CustomersRepository {
  constructor(
    private readonly users: InMemoryUsersRepository,
    private readonly orders: InMemoryOrdersRepository,
  ) {}

  async list(
    filter: CustomerListFilter,
  ): Promise<{ items: CustomerRecord[]; total: number }> {
    const rows = this.users
      .all()
      .filter((user) => user.role === Role.Customer)
      .map((user) => this.toRecord(user))
      .filter((customer) => matches(customer, filter));

    rows.sort((a, b) => compare(a, b, filter));

    const start = (filter.page - 1) * filter.limit;

    return {
      items: rows.slice(start, start + filter.limit),
      total: rows.length,
    };
  }

  async findById(id: string): Promise<CustomerRecord | null> {
    const user = this.users.all().find((candidate) => candidate.id === id);

    if (!user || user.role !== Role.Customer) {
      return null;
    }

    return this.toRecord(user);
  }

  async overview(now = new Date()): Promise<CustomerOverview> {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const customers = this.users
      .all()
      .filter((user) => user.role === Role.Customer)
      .map((user) => this.toRecord(user));

    const buying = customers.filter(
      (customer) => customer.metrics.successfulOrders >= 1,
    );
    const totalNetSpent = customers.reduce(
      (sum, customer) => sum + customer.metrics.netSpent,
      0,
    );

    return {
      totalCustomers: customers.length,
      newThisMonth: customers.filter(
        (customer) => customer.createdAt.getTime() >= monthStart.getTime(),
      ).length,
      active: customers.filter((customer) => customer.status === 'active').length,
      suspended: customers.filter((customer) => customer.status === 'suspended')
        .length,
      deactivated: customers.filter((customer) => customer.status === 'deactivated')
        .length,
      repeatCustomers: customers.filter(
        (customer) => customer.metrics.successfulOrders >= 2,
      ).length,
      buyingCustomers: buying.length,
      totalNetSpent,
      averageSpend: buying.length > 0 ? Math.round(totalNetSpent / buying.length) : 0,
    };
  }

  async addresses(id: string): Promise<CustomerAddress[]> {
    const seen = new Set<string>();
    const addresses: CustomerAddress[] = [];

    const orders = this.orders
      .all()
      .filter((order) => order.userId === id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    for (const order of orders) {
      const address = order.shippingAddress;
      const key = `${address.line1}|${address.postalCode}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      addresses.push({
        recipientName: address.recipientName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
        orderNumber: order.orderNumber,
        lastUsedAt: order.createdAt,
      });
    }

    return addresses.slice(0, 10);
  }

  // ------------------------------------------------------------------ helpers

  private toRecord(user: UserRecord): CustomerRecord {
    const orders: OrderRecord[] = this.orders
      .all()
      .filter((order) => order.userId === user.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const successful = orders.filter((order) => isSuccessfulPurchase(order));
    const latest = orders.at(-1);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || latest?.customerPhone || undefined,
      avatarUrl: user.avatarUrl,
      status: user.status,
      statusHistory: user.statusHistory,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      metrics: {
        totalOrders: orders.length,
        successfulOrders: successful.length,
        netSpent: successful.reduce((sum, order) => sum + orderNetSpent(order), 0),
        refundedAmount: orders.reduce(
          (sum, order) => sum + processedRefundsTotal(order),
          0,
        ),
        pendingRefundAmount: orders.reduce(
          (sum, order) => sum + pendingRefundsTotal(order),
          0,
        ),
        firstOrderAt: orders[0]?.createdAt ?? null,
        lastOrderAt: latest?.createdAt ?? null,
        lastOrderPhone: latest?.customerPhone,
      },
    };
  }
}

function matches(customer: CustomerRecord, filter: CustomerListFilter): boolean {
  if (filter.status && customer.status !== filter.status) {
    return false;
  }

  if (filter.from && customer.createdAt.getTime() < filter.from.getTime()) {
    return false;
  }

  if (filter.to && customer.createdAt.getTime() > filter.to.getTime()) {
    return false;
  }

  if (filter.minSpent !== undefined && customer.metrics.netSpent < filter.minSpent) {
    return false;
  }

  if (filter.maxSpent !== undefined && customer.metrics.netSpent > filter.maxSpent) {
    return false;
  }

  if (filter.hasOrders && customer.metrics.successfulOrders < 1) {
    return false;
  }

  if (filter.search) {
    const needle = filter.search.toLowerCase();

    const haystack = [
      customer.firstName,
      customer.lastName ?? '',
      customer.email,
      customer.phone ?? '',
    ]
      .join(' ')
      .toLowerCase();

    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

function compare(
  a: CustomerRecord,
  b: CustomerRecord,
  filter: CustomerListFilter,
): number {
  const direction = filter.sortOrder === 'asc' ? 1 : -1;

  switch (filter.sortBy) {
    case 'netSpent':
      return (a.metrics.netSpent - b.metrics.netSpent) * direction;
    case 'name':
      return (
        `${a.firstName} ${a.lastName ?? ''}`.localeCompare(
          `${b.firstName} ${b.lastName ?? ''}`,
        ) * direction
      );
    default:
      return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
  }
}
