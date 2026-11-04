import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import type { SessionsRepository } from '../auth/repositories/sessions.repository.js';
import { CustomersService } from './customers.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import { InMemoryCustomersRepository } from '../../../test/support/in-memory-customers.repository.js';
import { InMemoryOrdersRepository } from '../../../test/support/in-memory-orders.repository.js';
import { InMemoryUsersRepository } from '../../../test/support/in-memory-users.repository.js';
import type { UserRecord } from '../users/repositories/users.repository.js';
import { UsersService } from '../users/users.service.js';

const ADMIN: AuthenticatedUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'admin@example.com',
  role: Role.Admin,
};

describe('CustomersService', () => {
  let users: InMemoryUsersRepository;
  let orders: InMemoryOrdersRepository;
  let repo: InMemoryCustomersRepository;
  let sessions: { revokeAllForUser: ReturnType<typeof vi.fn> };
  let ordersService: { listForUser: ReturnType<typeof vi.fn> };
  let service: CustomersService;

  const seedCustomer = (
    overrides: Partial<Parameters<InMemoryUsersRepository['seed']>[0]> = {},
  ): UserRecord =>
    users.seed({
      email: 'asha@example.com',
      passwordHash: 'hash',
      firstName: 'Asha',
      lastName: 'Rao',
      role: Role.Customer,
      isActive: true,
      ...overrides,
    });

  /** A paid order that counts towards spending. */
  const seedPaidOrder = (
    userId: string,
    overrides: Parameters<InMemoryOrdersRepository['seed']>[0] = {},
  ) => {
    const total = overrides.total ?? 100_000;

    return orders.seed({
      userId,
      status: 'delivered',
      paymentStatus: 'paid',
      total,
      // Money collected matches the total unless a test says otherwise.
      payment: {
        method: 'card',
        paidAmount: total,
        paidAt: new Date(),
        refunds: [],
      },
      ...overrides,
    });
  };

  beforeEach(() => {
    users = new InMemoryUsersRepository();
    orders = new InMemoryOrdersRepository();
    repo = new InMemoryCustomersRepository(users, orders);
    sessions = { revokeAllForUser: vi.fn(async () => 2) };
    ordersService = {
      listForUser: vi.fn(async () => ({
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })),
    };
    service = new CustomersService(
      repo,
      new UsersService(users, { get: () => 4 } as never),
      sessions as unknown as SessionsRepository,
      ordersService as unknown as OrdersService,
    );
  });

  describe('listing', () => {
    it('paginates and maps customers without exposing credentials', async () => {
      seedCustomer({ email: 'asha@example.com' });
      seedCustomer({ email: 'ravi@example.com', firstName: 'Ravi', lastName: undefined });

      const page = await service.list({ page: 1, limit: 1, sortBy: 'createdAt', sortOrder: 'desc' } as never);

      expect(page.meta.total).toBe(2);
      expect(page.meta.totalPages).toBe(2);
      expect(page.data).toHaveLength(1);
      expect(JSON.stringify(page)).not.toContain('passwordHash');
      expect(JSON.stringify(page)).not.toContain('hash');
    });

    it('searches by name, email and phone', async () => {
      const asha = seedCustomer({ email: 'asha@example.com', firstName: 'Asha' });
      seedCustomer({ email: 'ravi@example.com', firstName: 'Ravi' });
      seedPaidOrder(asha.id);

      const byName = await service.list({ page: 1, limit: 20, search: 'ash', sortBy: 'createdAt', sortOrder: 'desc' } as never);
      const byEmail = await service.list({ page: 1, limit: 20, search: 'ravi@', sortBy: 'createdAt', sortOrder: 'desc' } as never);
      const byPhone = await service.list({ page: 1, limit: 20, search: '90000', sortBy: 'createdAt', sortOrder: 'desc' } as never);

      expect(byName.data.map((row) => row.email)).toEqual(['asha@example.com']);
      expect(byEmail.data.map((row) => row.email)).toEqual(['ravi@example.com']);
      // Phone comes from the latest order when the account has none stored.
      expect(byPhone.data.map((row) => row.email)).toEqual(['asha@example.com']);
      expect(byPhone.data[0].phone).toBe('+91 90000 00000');
    });

    it('filters by status, registration date, spending and having orders', async () => {
      const active = seedCustomer({ email: 'active@example.com' });
      const suspended = seedCustomer({ email: 'suspended@example.com' });
      seedCustomer({ email: 'quiet@example.com' });

      seedPaidOrder(active.id, { total: 250_000 });
      await service.changeStatus(
        suspended.id,
        { status: 'suspended', reason: 'Fraud review' },
        ADMIN,
      );

      const suspendedOnly = await service.list({
        page: 1,
        limit: 20,
        status: 'suspended',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as never);
      const spenders = await service.list({
        page: 1,
        limit: 20,
        minSpent: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as never);
      const buyers = await service.list({
        page: 1,
        limit: 20,
        hasOrders: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as never);
      const future = await service.list({
        page: 1,
        limit: 20,
        from: new Date(Date.now() + 86_400_000),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as never);

      expect(suspendedOnly.data.map((row) => row.email)).toEqual([
        'suspended@example.com',
      ]);
      expect(spenders.data.map((row) => row.email)).toEqual(['active@example.com']);
      expect(buyers.data).toHaveLength(1);
      expect(future.data).toHaveLength(0);
    });

    it('sorts by total spending', async () => {
      const low = seedCustomer({ email: 'low@example.com' });
      const high = seedCustomer({ email: 'high@example.com' });

      seedPaidOrder(low.id, { total: 50_000 });
      seedPaidOrder(high.id, { total: 500_000 });

      const descending = await service.list({
        page: 1,
        limit: 20,
        sortBy: 'netSpent',
        sortOrder: 'desc',
      } as never);

      expect(descending.data.map((row) => row.email)).toEqual([
        'high@example.com',
        'low@example.com',
      ]);
    });

    it('rejects an inverted spending range', async () => {
      await expect(
        service.list({ page: 1, limit: 20, minSpent: 500, maxSpent: 100, sortBy: 'createdAt', sortOrder: 'desc' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('spending', () => {
    it('counts paid orders, nets processed refunds and ignores cancelled/failed ones', async () => {
      const customer = seedCustomer();

      // Paid, untouched → 1000.00
      seedPaidOrder(customer.id, { total: 100_000 });
      // Paid then partially refunded (processed) → 400.00 net
      seedPaidOrder(customer.id, {
        total: 80_000,
        paymentStatus: 'partially_refunded',
        payment: {
          method: 'card',
          paidAmount: 80_000,
          refunds: [
            {
              refundId: 'r1',
              amount: 40_000,
              status: 'processed',
              reason: 'Return',
              requestedAt: new Date(),
            },
          ],
        },
      });
      // Pending refund → still counted at full value
      seedPaidOrder(customer.id, {
        total: 20_000,
        paymentStatus: 'refund_pending',
        payment: {
          method: 'card',
          paidAmount: 20_000,
          refunds: [
            {
              refundId: 'r2',
              amount: 20_000,
              status: 'pending',
              reason: 'Cancelled',
              requestedAt: new Date(),
            },
          ],
        },
      });
      // Cancelled → excluded even though money was collected
      seedPaidOrder(customer.id, { status: 'cancelled', total: 999_000 });
      // Never paid → excluded
      orders.seed({
        userId: customer.id,
        status: 'pending',
        paymentStatus: 'failed',
        total: 500_000,
        payment: { method: 'card', paidAmount: 0, refunds: [] },
      });

      const detail = await service.detail(customer.id);

      expect(detail.metrics.totalOrders).toBe(5);
      expect(detail.metrics.successfulOrders).toBe(3);
      expect(detail.metrics.totalSpent).toBe(100_000 + 40_000 + 20_000);
      expect(detail.metrics.refundedAmount).toBe(40_000);
      expect(detail.metrics.pendingRefundAmount).toBe(20_000);
      expect(detail.metrics.averageOrderValue).toBe(
        Math.round((100_000 + 40_000 + 20_000) / 3),
      );
    });

    it('handles customers with no orders', async () => {
      const customer = seedCustomer();

      const detail = await service.detail(customer.id);

      expect(detail.metrics.totalOrders).toBe(0);
      expect(detail.metrics.totalSpent).toBe(0);
      expect(detail.metrics.averageOrderValue).toBe(0);
      expect(detail.metrics.lastOrderAt).toBeNull();
      expect(detail.addresses).toEqual([]);
    });

    it('derives distinct addresses from order snapshots, newest first', async () => {
      const customer = seedCustomer();

      seedPaidOrder(customer.id, {
        createdAt: new Date(Date.now() - 86_400_000),
        shippingAddress: {
          recipientName: 'Asha Rao',
          phone: '+91 90000 00000',
          line1: '1 Old Street',
          city: 'Coimbatore',
          state: 'Tamil Nadu',
          postalCode: '641001',
          country: 'India',
        },
      });
      seedPaidOrder(customer.id, {
        shippingAddress: {
          recipientName: 'Asha Rao',
          phone: '+91 90000 00000',
          line1: '2 New Street',
          city: 'Coimbatore',
          state: 'Tamil Nadu',
          postalCode: '641002',
          country: 'India',
        },
      });

      const detail = await service.detail(customer.id);

      expect(detail.addresses).toHaveLength(2);
      expect(detail.addresses[0].line1).toBe('2 New Street');
    });
  });

  describe('account status', () => {
    it('suspends, records the admin and revokes sessions', async () => {
      const customer = seedCustomer();

      const updated = await service.changeStatus(
        customer.id,
        { status: 'suspended', reason: 'Chargeback abuse' },
        ADMIN,
      );

      expect(updated.status).toBe('suspended');
      expect(updated.statusLabel).toBe('Suspended');
      expect(updated.statusHistory).toHaveLength(1);
      expect(updated.statusHistory[0]).toMatchObject({
        from: 'active',
        to: 'suspended',
        reason: 'Chargeback abuse',
        by: 'admin@example.com',
      });
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith(customer.id);

      // The legacy mirror flips too, so auth stops accepting the account.
      const stored = users.all().find((user) => user.id === customer.id);
      expect(stored?.isActive).toBe(false);
    });

    it('reactivates and keeps the earlier history entry', async () => {
      const customer = seedCustomer();

      await service.changeStatus(customer.id, { status: 'suspended' }, ADMIN);
      const reactivated = await service.changeStatus(customer.id, { status: 'active' }, ADMIN);

      expect(reactivated.status).toBe('active');
      expect(reactivated.statusHistory).toHaveLength(2);
      expect(reactivated.activity.map((entry) => entry.kind)).toEqual([
        'status_changed',
        'status_changed',
        'account_created',
      ]);
      expect(sessions.revokeAllForUser).toHaveBeenCalledTimes(1);
    });

    it('refuses no-op and illegal transitions', async () => {
      const customer = seedCustomer();

      await expect(
        service.changeStatus(customer.id, { status: 'active' }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);

      const deactivated = await service.changeStatus(customer.id, { status: 'deactivated' }, ADMIN);
      expect(deactivated.status).toBe('deactivated');

      // deactivated → suspended is not a legal move; only reactivation is.
      await expect(
        service.changeStatus(customer.id, { status: 'suspended' }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s unknown customers and never resolves admins as customers', async () => {
      const admin = users.seed({
        email: 'admin@example.com',
        passwordHash: 'hash',
        firstName: 'Admin',
        role: Role.Admin,
        isActive: true,
      });

      await expect(service.detail(admin.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.detail('507f1f77bcf86cd799439099'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.changeStatus('not-an-id', { status: 'suspended' }, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports a conflict when the account moved on first', async () => {
      const customer = seedCustomer();

      // Another admin suspends it between our read and our write.
      await service.changeStatus(customer.id, { status: 'suspended' }, ADMIN);

      const stale = new CustomersService(
        repo,
        new UsersService(users, { get: () => 4 } as never),
        sessions as unknown as SessionsRepository,
        ordersService as unknown as OrdersService,
      );

      vi.spyOn(stale as never, 'detail' as never);

      // Force the guarded write to lose: the repository sees a different status.
      const changed = await users.updateStatus(customer.id, 'active', {
        status: 'deactivated',
        entry: {
          from: 'active',
          to: 'deactivated',
          at: new Date(),
        },
      });
      expect(changed).toBeNull();
    });
  });

  describe('overview', () => {
    it('counts statuses, repeat buyers and average spend from real data', async () => {
      const repeat = seedCustomer({ email: 'repeat@example.com' });
      const single = seedCustomer({ email: 'single@example.com' });
      const quiet = seedCustomer({ email: 'quiet@example.com' });

      seedPaidOrder(repeat.id, { total: 100_000 });
      seedPaidOrder(repeat.id, { total: 200_000 });
      seedPaidOrder(single.id, { total: 300_000 });
      await service.changeStatus(quiet.id, { status: 'suspended' }, ADMIN);

      const overview = await service.overview();

      expect(overview.totalCustomers).toBe(3);
      expect(overview.active).toBe(2);
      expect(overview.suspended).toBe(1);
      expect(overview.deactivated).toBe(0);
      expect(overview.repeatCustomers).toBe(1);
      expect(overview.buyingCustomers).toBe(2);
      expect(overview.totalNetSpent).toBe(600_000);
      expect(overview.averageSpend).toBe(300_000);
      expect(overview.newThisMonth).toBe(3);
      expect(overview.currency).toBe('INR');
    });
  });

  describe('orders', () => {
    it('scopes order history to the customer through the order module', async () => {
      const customer = seedCustomer();

      await service.orders(customer.id, { page: 1, limit: 20 } as never);

      expect(ordersService.listForUser).toHaveBeenCalledWith(customer.id, {
        page: 1,
        limit: 20,
      });
    });

    it('refuses order history for an unknown customer', async () => {
      await expect(
        service.orders('507f1f77bcf86cd799439099', { page: 1, limit: 20 } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('CSV export', () => {
    it('emits a header and one quoted row per customer', async () => {
      const customer = seedCustomer({ email: 'asha@example.com' });
      seedCustomer({
        email: 'ravi@example.com',
        firstName: 'Ravi "R"',
        lastName: undefined,
      });
      seedPaidOrder(customer.id, { total: 123_400 });

      const csv = await service.exportCsv({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as never);

      const lines = csv.split('\r\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('"Email"');
      expect(lines[0]).toContain('"Net spend"');
      expect(lines.join('\n')).toContain('"1234.00"');
      // Quotes are doubled so the CSV stays parseable.
      expect(lines.join('\n')).toContain('"Ravi ""R"""');
      expect(csv).not.toContain('passwordHash');
    });

    it('respects the filters used by the table', async () => {
      seedCustomer({ email: 'asha@example.com' });
      const suspended = seedCustomer({ email: 'suspended@example.com' });

      await service.changeStatus(suspended.id, { status: 'suspended' }, ADMIN);

      const csv = await service.exportCsv({
        page: 1,
        limit: 20,
        status: 'suspended',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as never);

      expect(csv).toContain('suspended@example.com');
      expect(csv).not.toContain('asha@example.com');
    });
  });
});

describe('CustomersService conflict handling', () => {
  it('throws when the guarded status write loses a race', async () => {
    const users = new InMemoryUsersRepository();
    const customer = users.seed({
      email: 'asha@example.com',
      passwordHash: 'hash',
      firstName: 'Asha',
      role: Role.Customer,
      isActive: true,
    });

    const usersService = new UsersService(users, { get: () => 4 } as never);
    const stale = { ...customer, status: 'active' as const };

    // Simulate the account changing after the service read it.
    await usersService.changeStatus(stale.id, 'active', {
      status: 'suspended',
      entry: { from: 'active', to: 'suspended', at: new Date() },
    });

    const repo = {
      findById: async () => ({
        ...stale,
        metrics: {
          totalOrders: 0,
          successfulOrders: 0,
          netSpent: 0,
          refundedAmount: 0,
          pendingRefundAmount: 0,
          firstOrderAt: null,
          lastOrderAt: null,
        },
        statusHistory: [],
      }),
      addresses: async () => [],
      list: async () => ({ items: [], total: 0 }),
      overview: async () => ({
        totalCustomers: 0,
        newThisMonth: 0,
        active: 0,
        suspended: 0,
        deactivated: 0,
        repeatCustomers: 0,
        buyingCustomers: 0,
        totalNetSpent: 0,
        averageSpend: 0,
      }),
    };

    const service = new CustomersService(
      repo as never,
      usersService,
      { revokeAllForUser: async () => 0 } as never,
      {} as never,
    );

    await expect(
      service.changeStatus(customer.id, { status: 'suspended' }, ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
