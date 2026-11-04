import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemoryDashboardRepository } from './support/in-memory-dashboard.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.BCRYPT_ROUNDS = '4';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const CUSTOMER = { email: 'customer@example.com', password: 'Str0ngPassw0rd' };

describe('Admin dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let customerToken: string;

  const server = () => app.getHttpServer();

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const users = new InMemoryUsersRepository();
    const sessions = new InMemorySessionsRepository();

    users.seed({
      email: ADMIN.email,
      passwordHash: await bcrypt.hash(ADMIN.password, 4),
      firstName: 'Store',
      lastName: 'Owner',
      role: Role.Admin,
      isActive: true,
    });
    users.seed({
      email: CUSTOMER.email,
      passwordHash: await bcrypt.hash(CUSTOMER.password, 4),
      firstName: 'Nitheesh',
      lastName: 'V',
      role: Role.Customer,
      isActive: true,
    });

    const dashboard = new InMemoryDashboardRepository(
      {
        getRevenueSeries: async () => [{ date: new Date().toISOString().slice(0, 10), value: 129_900 }],
        getOrdersSeries: async () => [],
        getOrderStatusDistribution: async () => [{ status: 'pending', count: 2 }],
        getSalesByCategory: async () => [], // empty state must survive the round trip
        getRecentOrders: async () => [
          {
            id: 'order-1',
            orderNumber: 'ORD-1001',
            customerName: 'Nitheesh V',
            total: 129_900,
            status: 'pending',
            paymentStatus: 'paid',
            createdAt: new Date('2026-11-03T10:00:00.000Z').toISOString(),
          },
        ],
        getTopProducts: async () => [
          { id: 'p1', name: 'Runner', unitsSold: 3, revenue: 89_700 },
        ],
        getLowStock: async () => [
          { id: 'p2', name: 'Cap', sku: 'CAP-1', stock: 1, lowStockThreshold: 5 },
        ],
        getRecentCustomers: async () => [
          {
            id: 'u1',
            name: 'Nitheesh V',
            email: CUSTOMER.email,
            createdAt: new Date('2026-11-01T09:00:00.000Z').toISOString(),
          },
        ],
      },
      {
        revenue: 129_900,
        orders: 1,
        products: 12,
        customers: 1,
        pendingOrders: 2,
        lowStockProducts: 1,
        averageOrderValue: 129_900,
      },
    );

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      dashboard,
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    customerToken = await login(CUSTOMER.email, CUSTOMER.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authorization', () => {
    it('rejects anonymous requests', async () => {
      const response = await request(server())
        .get('/api/admin/dashboard/overview')
        .expect(401);

      expect(response.body.statusCode).toBe(401);
    });

    it('rejects a customer token with 403', async () => {
      const response = await request(server())
        .get('/api/admin/dashboard/overview')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      expect(response.body.message).toBe(
        'You do not have permission to access this resource',
      );
    });
  });

  describe('GET /api/admin/dashboard/overview', () => {
    it('returns metrics, charts and activity sections for an admin', async () => {
      const response = await request(server())
        .get('/api/admin/dashboard/overview?range=7d')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const { data } = response.body;

      expect(response.body.success).toBe(true);
      expect(data.range.key).toBe('7d');
      expect(data.metrics).toMatchObject({
        revenue: 129_900,
        orders: 1,
        products: 12,
        customers: 1,
        pendingOrders: 2,
        lowStockProducts: 1,
      });

      // Seven daily buckets, gap-filled.
      expect(data.revenueSeries).toHaveLength(7);
      expect(data.ordersSeries).toHaveLength(7);
      expect(data.orderStatusDistribution).toEqual([{ status: 'pending', count: 2 }]);
      expect(data.salesByCategory).toEqual([]);
      expect(data.recentOrders[0]).toMatchObject({ orderNumber: 'ORD-1001' });
      expect(data.topProducts[0]).toMatchObject({ name: 'Runner' });
      expect(data.lowStock[0]).toMatchObject({ sku: 'CAP-1', stock: 1 });
      expect(data.recentCustomers[0]).toMatchObject({ email: CUSTOMER.email });
      expect(data.generatedAt).toEqual(expect.any(String));
    });

    it('accepts a custom range', async () => {
      const response = await request(server())
        .get('/api/admin/dashboard/overview')
        .query({
          range: 'custom',
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-03T23:59:59.000Z',
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.range.key).toBe('custom');
      expect(response.body.data.revenueSeries).toHaveLength(3);
    });

    it('rejects a custom range missing a bound', async () => {
      const response = await request(server())
        .get('/api/admin/dashboard/overview?range=custom&from=2026-10-01T00:00:00.000Z')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.message).toContain('custom range requires both');
    });

    it('rejects an unknown range value at the DTO boundary', async () => {
      await request(server())
        .get('/api/admin/dashboard/overview?range=all-time')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });
});
