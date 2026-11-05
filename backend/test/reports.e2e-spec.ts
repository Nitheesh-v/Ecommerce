import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemoryCustomerInsightsRepository } from './support/in-memory-customer-insights.repository.js';
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

describe('Admin reports (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let customerToken: string;

  const server = () => app.getHttpServer();
  const today = new Date().toISOString().slice(0, 10);

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
        getRevenueSeries: async () => [{ date: today, value: 129_900 }],
        getOrdersSeries: async () => [{ date: today, value: 2 }],
        getOrderStatusDistribution: async () => [
          { status: 'delivered', count: 3 },
          { status: 'pending', count: 1 },
        ],
        getSalesByCategory: async () => [
          { category: 'Footwear', revenue: 89_700, orders: 2 },
          // A comma must survive the CSV round trip.
          { category: 'Shirts, tees', revenue: 24_500, orders: 1 },
        ],
        getTopProducts: async () => [
          { id: 'p1', name: 'Runner', unitsSold: 3, revenue: 89_700 },
        ],
      },
      {
        revenue: 129_900,
        orders: 2,
        products: 12,
        customers: 5,
        pendingOrders: 1,
        lowStockProducts: 2,
        averageOrderValue: 64_950,
      },
    );

    const customerInsights = new InMemoryCustomerInsightsRepository(
      {
        topCustomers: async (_from, _to, limit) => {
          expect(limit).toBe(10);

          return [
            {
              id: '5f1d7a9b8c1e2d3f4a5b6c7d',
              name: 'Nitheesh V',
              email: CUSTOMER.email,
              orders: 2,
              spend: 129_900,
              lastOrderAt: new Date('2026-11-03T10:00:00.000Z').toISOString(),
            },
            {
              id: null,
              name: 'Guest Buyer',
              email: 'guest@example.com',
              orders: 1,
              spend: 24_900,
              lastOrderAt: new Date('2026-11-02T10:00:00.000Z').toISOString(),
            },
          ];
        },
      },
      {
        newCustomers: 3,
        repeatCustomers: 2,
        activeCustomers: 5,
        repeatRate: 40,
        ordersPerCustomer: 1.4,
        averageOrderValue: 64_950,
      },
    );

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      dashboard,
      customerInsights,
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    customerToken = await login(CUSTOMER.email, CUSTOMER.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authorization', () => {
    it('rejects anonymous access to every report route', async () => {
      await request(server()).get('/api/admin/reports/sales').expect(401);
      await request(server()).get('/api/admin/reports/customers').expect(401);
      await request(server()).get('/api/admin/reports/sales/export').expect(401);
    });

    it('rejects a customer token with 403', async () => {
      await request(server())
        .get('/api/admin/reports/sales')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      await request(server())
        .get('/api/admin/reports/customers/export')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });
  });

  describe('GET /api/admin/reports/sales', () => {
    it('returns totals, a gap-filled series, mix and rankings', async () => {
      const response = await request(server())
        .get('/api/admin/reports/sales?range=7d')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const { data } = response.body;

      expect(data.range.key).toBe('7d');
      expect(data.totals).toMatchObject({
        revenue: 129_900,
        orders: 2,
        averageOrderValue: 64_950,
        products: 12,
        customers: 5,
      });
      expect(data.revenueSeries).toHaveLength(7);
      expect(data.ordersSeries).toHaveLength(7);
      expect(data.statusMix).toEqual([
        { status: 'delivered', count: 3 },
        { status: 'pending', count: 1 },
      ]);
      expect(data.categorySales[0]).toEqual({
        category: 'Footwear',
        revenue: 89_700,
        orders: 2,
      });
      expect(data.topProducts).toEqual([
        { id: 'p1', name: 'Runner', unitsSold: 3, revenue: 89_700 },
      ]);
    });

    it('rejects a custom range with no bounds', async () => {
      const response = await request(server())
        .get('/api/admin/reports/sales?range=custom')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('GET /api/admin/reports/customers', () => {
    it('returns new vs repeat figures and the top buyers', async () => {
      const response = await request(server())
        .get('/api/admin/reports/customers?range=30d')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const { data } = response.body;

      expect(data.summary).toEqual({
        newCustomers: 3,
        repeatCustomers: 2,
        activeCustomers: 5,
        repeatRate: 40,
        ordersPerCustomer: 1.4,
        averageOrderValue: 64_950,
      });
      expect(data.topCustomers).toHaveLength(2);
      // A guest checkout is keyed by email, so it has no user id.
      expect(data.topCustomers[1]).toMatchObject({ id: null, name: 'Guest Buyer' });
    });
  });

  describe('CSV exports', () => {
    it('streams the sales report as an attachment without a JSON envelope', async () => {
      const response = await request(server())
        .get('/api/admin/reports/sales/export?range=7d')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect('Content-Type', /text\/csv/);

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('sales-report-');

      const csv = response.text;

      expect(csv.startsWith('Report,Sales')).toBe(true);
      expect(csv).toContain('Revenue (minor units),129900');
      expect(csv).toContain('Product,Units sold,Revenue (minor units)');
      expect(csv).toContain('Runner,3,89700');
      // Values containing a comma are quoted, so the row keeps its column count.
      expect(csv).toContain('"Shirts, tees",1,24500');
      expect(csv).not.toContain('"success"');
      expect(csv.includes('\r\n')).toBe(true);
    });

    it('streams the customer report with its summary block', async () => {
      const response = await request(server())
        .get('/api/admin/reports/customers/export?range=30d')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect('Content-Type', /text\/csv/);

      expect(response.headers['content-disposition']).toContain('customer-report-');

      const csv = response.text;

      expect(csv.startsWith('Report,Customers')).toBe(true);
      expect(csv).toContain('New customers,3');
      expect(csv).toContain('Repeat rate (%),40');
      expect(csv).toContain(`Nitheesh V,${CUSTOMER.email},2,129900`);
      expect(csv).not.toContain('passwordHash');
    });
  });
});
