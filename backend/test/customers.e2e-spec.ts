import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { FakeImageStorage } from './support/fake-image-storage.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemoryCategoriesRepository } from './support/in-memory-categories.repository.js';
import { InMemoryCustomersRepository } from './support/in-memory-customers.repository.js';
import { InMemoryInventoryRepository } from './support/in-memory-inventory.repository.js';
import { InMemoryOrdersRepository } from './support/in-memory-orders.repository.js';
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.BCRYPT_ROUNDS = '4';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const ASHA = { email: 'asha@example.com', password: 'Str0ngPassw0rd' };
const RAVI = { email: 'ravi@example.com', password: 'Str0ngPassw0rd' };

const ADDRESS = {
  recipientName: 'Asha Rao',
  phone: '+91 90000 00001',
  line1: '10 Curzon Street',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
};

describe('Customers (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let users: InMemoryUsersRepository;
  let orders: InMemoryOrdersRepository;
  let ashaId: string;
  let raviId: string;

  const server = () => app.getHttpServer();

  const asAdmin = (method: 'get' | 'patch', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  function seedOrder(
    userId: string,
    overrides: Parameters<InMemoryOrdersRepository['seed']>[0] = {},
  ) {
    const total = overrides.total ?? 100_000;

    return orders.seed({
      userId,
      status: 'delivered',
      paymentStatus: 'paid',
      total,
      payment: { method: 'card', paidAmount: total, paidAt: new Date(), refunds: [] },
      ...overrides,
    });
  }

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    const sessions = new InMemorySessionsRepository();

    users.seed({
      email: ADMIN.email,
      passwordHash: await bcrypt.hash(ADMIN.password, 4),
      firstName: 'Store',
      lastName: 'Owner',
      role: Role.Admin,
      isActive: true,
    });

    ashaId = users.seed({
      email: ASHA.email,
      passwordHash: await bcrypt.hash(ASHA.password, 4),
      firstName: 'Asha',
      lastName: 'Rao',
      phone: '+91 90000 00001',
      role: Role.Customer,
      isActive: true,
    }).id;

    raviId = users.seed({
      email: RAVI.email,
      passwordHash: await bcrypt.hash(RAVI.password, 4),
      firstName: 'Ravi',
      lastName: 'Kumar',
      role: Role.Customer,
      isActive: true,
    }).id;

    const categories = new InMemoryCategoriesRepository();
    categories.seed({ id: '64b7f1c2a1b2c3d4e5f60001', name: 'Audio', slug: 'audio' });

    const products = new InMemoryProductsRepository();
    const inventory = new InMemoryInventoryRepository(products);
    orders = new InMemoryOrdersRepository();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory,
      orders,
      customers: new InMemoryCustomersRepository(users, orders),
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    orders.reset();
    // Status is account state, not fixture data: reset it without the API.
    users.forceStatus(ashaId, 'active');
    users.forceStatus(raviId, 'active');
  });

  describe('authorization', () => {
    it('blocks anonymous access', async () => {
      await request(server()).get('/api/admin/customers').expect(401);
      await request(server()).get('/api/admin/customers/summary').expect(401);
      await request(server()).get('/api/admin/customers/export').expect(401);
    });

    it('refuses customers on every admin customer route', async () => {
      const token = await login(ASHA.email, ASHA.password);

      await request(server())
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(server())
        .get(`/api/admin/customers/${ashaId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(server())
        .get('/api/admin/customers/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(server())
        .patch(`/api/admin/customers/${raviId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'suspended' })
        .expect(403);
    });
  });

  describe('listing', () => {
    it('lists customers only (never admins) with spending metrics', async () => {
      seedOrder(ashaId, { total: 120_000 });

      const response = await asAdmin('get', '/api/admin/customers').expect(200);

      const emails = response.body.data.map((row: { email: string }) => row.email);

      expect(emails).toContain(ASHA.email);
      expect(emails).toContain(RAVI.email);
      expect(emails).not.toContain(ADMIN.email);

      const asha = response.body.data.find(
        (row: { email: string }) => row.email === ASHA.email,
      );

      expect(asha.metrics.totalOrders).toBe(1);
      expect(asha.metrics.successfulOrders).toBe(1);
      expect(asha.metrics.totalSpent).toBe(120_000);
      expect(asha.status).toBe('active');
      expect(asha.fullName).toBe('Asha Rao');
    });

    it('searches by name, email and phone', async () => {
      const byName = await asAdmin('get', '/api/admin/customers?search=asha').expect(200);
      const byEmail = await asAdmin('get', '/api/admin/customers?search=ravi@').expect(200);
      const byPhone = await asAdmin('get', '/api/admin/customers?search=90000 00001').expect(200);

      expect(byName.body.data).toHaveLength(1);
      expect(byName.body.data[0].email).toBe(ASHA.email);
      expect(byEmail.body.data).toHaveLength(1);
      expect(byEmail.body.data[0].email).toBe(RAVI.email);
      expect(byPhone.body.data[0].email).toBe(ASHA.email);
    });

    it('filters by status and registration date', async () => {
      await asAdmin('patch', `/api/admin/customers/${raviId}/status`)
        .send({ status: 'suspended', reason: 'Chargeback review' })
        .expect(200);

      const suspended = await asAdmin(
        'get',
        '/api/admin/customers?status=suspended',
      ).expect(200);

      expect(suspended.body.data.map((row: { email: string }) => row.email)).toEqual([
        RAVI.email,
      ]);

      const future = new Date(Date.now() + 86_400_000).toISOString();
      const dated = await asAdmin(
        'get',
        `/api/admin/customers?from=${future}`,
      ).expect(200);

      expect(dated.body.data).toHaveLength(0);
    });

    it('filters and sorts by spending', async () => {
      seedOrder(raviId, { total: 500_000 });

      const spenders = await asAdmin(
        'get',
        '/api/admin/customers?minSpent=1&sortBy=netSpent&sortOrder=desc',
      ).expect(200);

      expect(spenders.body.data).toHaveLength(1);
      expect(spenders.body.data[0].email).toBe(RAVI.email);

      const byName = await asAdmin(
        'get',
        '/api/admin/customers?sortBy=netSpent&sortOrder=desc',
      ).expect(200);

      expect(byName.body.data[0].email).toBe(RAVI.email);
      expect(spenders.body.meta.total).toBe(1);
    });

    it('paginates on the server', async () => {
      const first = await asAdmin('get', '/api/admin/customers?limit=1&page=1').expect(200);
      const second = await asAdmin('get', '/api/admin/customers?limit=1&page=2').expect(200);

      expect(first.body.data).toHaveLength(1);
      expect(first.body.meta.total).toBe(2);
      expect(first.body.meta.totalPages).toBe(2);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    });

    it('rejects invalid filters instead of guessing', async () => {
      await asAdmin('get', '/api/admin/customers?sortBy=passwordHash').expect(400);
      await asAdmin('get', '/api/admin/customers?minSpent=500&maxSpent=100').expect(400);
      await asAdmin('get', '/api/admin/customers?status=deleted').expect(400);
    });
  });

  describe('detail', () => {
    it('returns profile, metrics, addresses and activity', async () => {
      seedOrder(ashaId, { total: 300_000, shippingAddress: ADDRESS });
      seedOrder(ashaId, {
        total: 120_000,
        shippingAddress: { ...ADDRESS, line1: '22 Beach Road', postalCode: '641002' },
      });

      const response = await asAdmin('get', `/api/admin/customers/${ashaId}`).expect(200);
      const body = response.body.data;

      expect(body.email).toBe(ASHA.email);
      expect(body.phone).toBe('+91 90000 00001');
      expect(body.metrics.totalOrders).toBe(2);
      expect(body.metrics.totalSpent).toBe(420_000);
      expect(body.metrics.averageOrderValue).toBe(210_000);
      expect(body.addresses).toHaveLength(2);
      expect(body.activity[0].kind).toBe('account_created');
    });

    it('never exposes credentials, hashes or tokens', async () => {
      seedOrder(ashaId);
      const list = await asAdmin('get', '/api/admin/customers').expect(200);
      const detail = await asAdmin('get', `/api/admin/customers/${ashaId}`).expect(200);
      const ordersResponse = await asAdmin(
        'get',
        `/api/admin/customers/${ashaId}/orders`,
      ).expect(200);

      for (const body of [JSON.stringify(list.body), JSON.stringify(detail.body), JSON.stringify(ordersResponse.body)]) {
        expect(body).not.toContain('passwordHash');
        expect(body).not.toContain('tokenHash');
        expect(body).not.toContain('$2b$');
        expect(body).not.toContain('password');
      }
    });

    it('404s an unknown or malformed customer id', async () => {
      await asAdmin('get', '/api/admin/customers/507f1f77bcf86cd799439099').expect(404);
      await asAdmin('get', '/api/admin/customers/not-an-object-id').expect(404);
      await asAdmin('get', `/api/admin/customers/${raviId}/summary`).expect(200);
    });

    it('returns only that customer’s orders', async () => {
      seedOrder(ashaId, { orderNumber: 'ORD-ASHA-1' });
      seedOrder(raviId, { orderNumber: 'ORD-RAVI-1' });

      const response = await asAdmin(
        'get',
        `/api/admin/customers/${ashaId}/orders`,
      ).expect(200);

      const numbers = response.body.data.map(
        (order: { orderNumber: string }) => order.orderNumber,
      );

      expect(numbers).toEqual(['ORD-ASHA-1']);
      expect(response.body).not.toContain('ORD-RAVI-1');
    });
  });

  describe('spending', () => {
    it('ignores cancelled and unpaid orders, and nets processed refunds', async () => {
      seedOrder(ashaId, { total: 100_000 });
      seedOrder(ashaId, {
        total: 80_000,
        paymentStatus: 'partially_refunded',
        payment: {
          method: 'card',
          paidAmount: 80_000,
          refunds: [
            {
              refundId: 'r1',
              amount: 30_000,
              status: 'processed',
              reason: 'Return',
              requestedAt: new Date(),
            },
          ],
        },
      });
      seedOrder(ashaId, { status: 'cancelled', total: 900_000 });
      orders.seed({
        userId: ashaId,
        status: 'pending',
        paymentStatus: 'failed',
        total: 700_000,
        payment: { method: 'card', paidAmount: 0, refunds: [] },
      });

      const response = await asAdmin('get', `/api/admin/customers/${ashaId}`).expect(200);

      expect(response.body.data.metrics.totalOrders).toBe(4);
      expect(response.body.data.metrics.successfulOrders).toBe(2);
      expect(response.body.data.metrics.totalSpent).toBe(100_000 + 50_000);
      expect(response.body.data.metrics.refundedAmount).toBe(30_000);
    });

    it('handles a customer with no orders', async () => {
      const response = await asAdmin('get', `/api/admin/customers/${raviId}`).expect(200);

      expect(response.body.data.metrics.totalOrders).toBe(0);
      expect(response.body.data.metrics.totalSpent).toBe(0);
      expect(response.body.data.addresses).toEqual([]);
    });
  });

  describe('analytics', () => {
    it('reports real counts, repeat buyers and average spend', async () => {
      seedOrder(ashaId, { total: 100_000 });
      seedOrder(ashaId, { total: 200_000 });
      seedOrder(raviId, { total: 300_000 });

      const response = await asAdmin('get', '/api/admin/customers/summary').expect(200);
      const summary = response.body.data;

      expect(summary.totalCustomers).toBe(2);
      expect(summary.active).toBe(2);
      expect(summary.repeatCustomers).toBe(1);
      expect(summary.buyingCustomers).toBe(2);
      expect(summary.totalNetSpent).toBe(600_000);
      expect(summary.averageSpend).toBe(300_000);
      expect(summary.newThisMonth).toBe(2);
    });
  });

  describe('account status', () => {
    it('suspends, records who/why, revokes sessions and blocks login', async () => {
      const token = await login(ASHA.email, ASHA.password);

      const response = await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'suspended', reason: 'Chargeback abuse' })
        .expect(200);

      expect(response.body.data.status).toBe('suspended');
      expect(response.body.data.statusHistory[0]).toMatchObject({
        from: 'active',
        to: 'suspended',
        reason: 'Chargeback abuse',
        by: ADMIN.email,
      });

      await request(server())
        .post('/api/auth/login')
        .send({ email: ASHA.email, password: ASHA.password })
        .expect(401);

      // An access token minted before the suspension stops working immediately.
      await request(server())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: '64b7f1c2a1b2c3d4e5f60099', quantity: 1 }],
          shippingAddress: ADDRESS,
          paymentMethod: 'cod',
        })
        .expect(403);
    });

    it('reactivates and lets the customer sign in again', async () => {
      await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'suspended' })
        .expect(200);

      const response = await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'active', reason: 'Appeal accepted' })
        .expect(200);

      expect(response.body.data.status).toBe('active');
      expect(response.body.data.statusHistory).toHaveLength(2);

      await login(ASHA.email, ASHA.password);
    });

    it('deactivates and preserves order history', async () => {
      const order = seedOrder(ashaId, { orderNumber: 'ORD-KEEP-1' });

      await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'deactivated', reason: 'Customer request' })
        .expect(200);

      const ordersAfter = await asAdmin('get', '/api/admin/orders').expect(200);
      const stillThere = ordersAfter.body.data.find(
        (row: { orderNumber: string }) => row.orderNumber === order.orderNumber,
      );

      expect(stillThere).toBeDefined();
      expect(stillThere.status).toBe('delivered');
    });

    it('refuses no-op and illegal transitions', async () => {
      await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'active' })
        .expect(400);

      await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'deactivated' })
        .expect(200);

      await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'suspended' })
        .expect(400);

      await asAdmin('patch', `/api/admin/customers/${ashaId}/status`)
        .send({ status: 'nonsense' })
        .expect(400);
    });

    it('does not manage admin accounts through the customer module', async () => {
      const admin = users.all().find((user) => user.email === ADMIN.email);

      await asAdmin('patch', `/api/admin/customers/${admin?.id}/status`)
        .send({ status: 'suspended' })
        .expect(404);
    });
  });

  describe('CSV export', () => {
    it('returns an attachment with a header row and the filtered rows', async () => {
      seedOrder(ashaId, { total: 123_400 });

      const response = await asAdmin('get', '/api/admin/customers/export').expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('"Email"');
      expect(response.text).toContain('"Net spend"');
      expect(response.text).toContain(ASHA.email);
      expect(response.text).toContain('"1234.00"');
      expect(response.text).not.toContain('passwordHash');
    });

    it('applies the same filters as the table', async () => {
      await asAdmin('patch', `/api/admin/customers/${raviId}/status`)
        .send({ status: 'suspended' })
        .expect(200);

      const response = await asAdmin(
        'get',
        '/api/admin/customers/export?status=suspended',
      ).expect(200);

      expect(response.text).toContain(RAVI.email);
      expect(response.text).not.toContain(ASHA.email);
    });
  });
});
