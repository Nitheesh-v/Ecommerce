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
const CUSTOMER = { email: 'customer@example.com', password: 'Str0ngPassw0rd' };
const OTHER = { email: 'other@example.com', password: 'Str0ngPassw0rd' };

const AUDIO_ID = '64b7f1c2a1b2c3d4e5f60001';

const ADDRESS = {
  recipientName: 'Nitheesh V',
  phone: '+91 98765 43210',
  line1: '10 Curzon Street',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
};

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let customerToken: string;
  let otherToken: string;
  let products: InMemoryProductsRepository;
  let orders: InMemoryOrdersRepository;
  let headphonesId: string;

  const server = () => app.getHttpServer();

  const asAdmin = (method: 'get' | 'post' | 'patch', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  const asCustomer = (method: 'get' | 'post', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${customerToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  /** Places an order through the customer API and returns its id. */
  async function placeOrder(
    quantity = 2,
    token = customerToken,
  ): Promise<{ id: string; orderNumber: string; total: number }> {
    const response = await request(server())
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: headphonesId, quantity }],
        shippingAddress: ADDRESS,
        paymentMethod: 'cod',
      })
      .expect(201);

    return {
      id: response.body.data.order.id as string,
      orderNumber: response.body.data.order.orderNumber as string,
      total: response.body.data.order.total as number,
    };
  }

  /** Drives an order to `delivered` through the admin status endpoint. */
  async function deliver(orderId: string): Promise<void> {
    for (const status of [
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
    ]) {
      await asAdmin('patch', `/api/admin/orders/${orderId}/status`)
        .send({ status })
        .expect(200);
    }
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

    for (const account of [CUSTOMER, OTHER]) {
      users.seed({
        email: account.email,
        passwordHash: await bcrypt.hash(account.password, 4),
        firstName: 'Nitheesh',
        lastName: 'V',
        role: Role.Customer,
        isActive: true,
      });
    }

    const categories = new InMemoryCategoriesRepository();
    categories.seed({ id: AUDIO_ID, name: 'Audio', slug: 'audio' });

    products = new InMemoryProductsRepository();
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
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    customerToken = await login(CUSTOMER.email, CUSTOMER.password);
    otherToken = await login(OTHER.email, OTHER.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    products.reset();
    orders.reset();

    headphonesId = products.seed({
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description: 'Studio-grade wireless headphones.',
      sku: 'SKU-AU-1001',
      categoryId: AUDIO_ID,
      price: 249_900,
      salePrice: 199_900,
      costPrice: 150_000,
      stock: 10,
      lowStockThreshold: 3,
      status: 'published',
      isFeatured: false,
      images: [{ url: 'https://cdn.example.com/headphones.jpg' }],
    }).id;

    products.seed({
      name: 'Draft Speaker',
      slug: 'draft-speaker',
      description: 'Not published yet.',
      sku: 'SKU-DRAFT-1',
      categoryId: AUDIO_ID,
      price: 99_900,
      costPrice: 50_000,
      stock: 5,
      lowStockThreshold: 2,
      status: 'draft',
      isFeatured: false,
      images: [],
    });
  });

  describe('authorization', () => {
    it('blocks anonymous access to orders', async () => {
      await request(server()).get('/api/admin/orders').expect(401);
      await request(server()).get('/api/orders').expect(401);
      await request(server()).post('/api/orders').send({}).expect(401);
    });

    it('refuses customers on the admin order routes', async () => {
      const list = await asCustomer('get', '/api/admin/orders').expect(403);
      expect(list.body.message).toMatch(/permission/i);

      await request(server())
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [], shippingAddress: ADDRESS, paymentMethod: 'cod' })
        .expect(400);

      const anOrder = await placeOrder();
      await asCustomer('get', `/api/admin/orders/${anOrder.id}`).expect(403);
      await request(server())
        .patch(`/api/admin/orders/${anOrder.id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'confirmed' })
        .expect(403);
    });
  });

  describe('checkout', () => {
    it('creates an order with server-computed totals and reserves stock', async () => {
      const response = await asCustomer('post', '/api/orders')
        .send({
          items: [{ productId: headphonesId, quantity: 2 }],
          shippingAddress: ADDRESS,
          paymentMethod: 'cod',
        })
        .expect(201);

      const order = response.body.data.order;

      expect(order).toMatchObject({
        status: 'pending',
        paymentStatus: 'pending',
        subtotal: 499_800,
        discountTotal: 100_000,
        shippingCharge: 0,
        total: 399_800,
        itemCount: 2,
        customerEmail: CUSTOMER.email,
      });
      expect(order.items[0]).toMatchObject({
        name: 'Wireless Headphones',
        sku: 'SKU-AU-1001',
        unitPrice: 199_900,
        quantity: 2,
      });
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(8);
    });

    it('ignores price fields a client tries to inject', async () => {
      const response = await asCustomer('post', '/api/orders')
        .send({
          items: [{ productId: headphonesId, quantity: 1 }],
          shippingAddress: ADDRESS,
          paymentMethod: 'cod',
          total: 1,
          unitPrice: 1,
        })
        .expect(400); // forbidNonWhitelisted: unknown properties are rejected outright

      expect(response.body.message).toBeDefined();
    });

    it('replays an idempotent checkout instead of duplicating the order', async () => {
      const payload = {
        items: [{ productId: headphonesId, quantity: 1 }],
        shippingAddress: ADDRESS,
        paymentMethod: 'cod',
        idempotencyKey: 'checkout-e2e-1',
      };

      const first = await asCustomer('post', '/api/orders').send(payload).expect(201);
      const second = await asCustomer('post', '/api/orders').send(payload).expect(201);

      expect(second.body.data.created).toBe(false);
      expect(second.body.data.order.id).toBe(first.body.data.order.id);
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(9);
    });

    it('rejects unpublished products and overselling', async () => {
      const draft = products.all().find((product) => product.sku === 'SKU-DRAFT-1')!;

      await asCustomer('post', '/api/orders')
        .send({
          items: [{ productId: draft.id, quantity: 1 }],
          shippingAddress: ADDRESS,
          paymentMethod: 'cod',
        })
        .expect(400);

      const oversell = await asCustomer('post', '/api/orders')
        .send({
          items: [{ productId: headphonesId, quantity: 99 }],
          shippingAddress: ADDRESS,
          paymentMethod: 'cod',
        })
        .expect(409);

      expect(oversell.body.message).toMatch(/available/i);
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(10);
    });

    it('validates the payload', async () => {
      await asCustomer('post', '/api/orders')
        .send({
          items: [{ productId: headphonesId, quantity: 0 }],
          shippingAddress: ADDRESS,
          paymentMethod: 'cod',
        })
        .expect(400);

      await asCustomer('post', '/api/orders')
        .send({
          items: [{ productId: headphonesId, quantity: 1 }],
          shippingAddress: { ...ADDRESS, phone: 'abc' },
          paymentMethod: 'cod',
        })
        .expect(400);
    });
  });

  describe('listing', () => {
    it('paginates, searches and filters', async () => {
      await placeOrder(1);
      await placeOrder(2);
      await placeOrder(3, otherToken);

      const all = await asAdmin('get', '/api/admin/orders?limit=2').expect(200);
      expect(all.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(all.body.data).toHaveLength(2);

      const byEmail = await asAdmin('get', '/api/admin/orders?search=other@example.com').expect(200);
      expect(byEmail.body.meta.total).toBe(1);

      const byNumber = await asAdmin(
        'get',
        `/api/admin/orders?search=${encodeURIComponent(orders.all()[0].orderNumber)}`,
      ).expect(200);
      expect(byNumber.body.meta.total).toBe(1);

      const byStatus = await asAdmin('get', '/api/admin/orders?status=confirmed').expect(200);
      expect(byStatus.body.meta.total).toBe(0);

      const byPayment = await asAdmin('get', '/api/admin/orders?paymentStatus=pending').expect(200);
      expect(byPayment.body.meta.total).toBe(3);

      const byMethod = await asAdmin('get', '/api/admin/orders?paymentMethod=upi').expect(200);
      expect(byMethod.body.meta.total).toBe(0);
    });

    it('sorts by total and rejects invalid filters', async () => {
      await placeOrder(1);
      await placeOrder(4);

      const sorted = await asAdmin('get', '/api/admin/orders?sortBy=total&sortOrder=desc').expect(200);
      const totals = sorted.body.data.map((order: { total: number }) => order.total);
      expect(totals).toEqual([...totals].sort((a, b) => b - a));

      await asAdmin('get', '/api/admin/orders?status=not-a-status').expect(400);
      await asAdmin('get', '/api/admin/orders?limit=500').expect(400);
    });

    it('filters by order date', async () => {
      await placeOrder();

      const today = new Date().toISOString().slice(0, 10);
      const inRange = await asAdmin(
        'get',
        `/api/admin/orders?from=${today}T00:00:00.000Z&to=${today}T23:59:59.999Z`,
      ).expect(200);
      expect(inRange.body.meta.total).toBe(1);

      const past = await asAdmin(
        'get',
        '/api/admin/orders?from=2020-01-01T00:00:00.000Z&to=2020-01-02T00:00:00.000Z',
      ).expect(200);
      expect(past.body.meta.total).toBe(0);
    });
  });

  describe('detail and history', () => {
    it('returns the full order and its timeline', async () => {
      const order = await placeOrder();

      const detail = await asAdmin('get', `/api/admin/orders/${order.id}`).expect(200);
      expect(detail.body.data).toMatchObject({
        id: order.id,
        orderNumber: order.orderNumber,
        status: 'pending',
      });
      expect(detail.body.data.allowedNextStatuses).toEqual(['confirmed']);

      const history = await asAdmin('get', `/api/admin/orders/${order.id}/history`).expect(200);
      expect(history.body.data[0]).toMatchObject({ kind: 'status', to: 'pending' });
    });

    it('404s for an unknown order id', async () => {
      await asAdmin('get', '/api/admin/orders/64b7f1c2a1b2c3d4e5f60718').expect(404);
      await asAdmin('get', '/api/admin/orders/not-an-id').expect(404);
    });
  });

  describe('status transitions', () => {
    it('accepts a legal transition and rejects an illegal one', async () => {
      const order = await placeOrder();

      const confirmed = await asAdmin('patch', `/api/admin/orders/${order.id}/status`)
        .send({ status: 'confirmed', reason: 'Payment verified' })
        .expect(200);
      expect(confirmed.body.data.status).toBe('confirmed');
      expect(confirmed.body.data.history.at(-1)).toMatchObject({
        from: 'pending',
        to: 'confirmed',
        reason: 'Payment verified',
      });

      await asAdmin('patch', `/api/admin/orders/${order.id}/status`)
        .send({ status: 'delivered' })
        .expect(409);

      await asAdmin('patch', `/api/admin/orders/${order.id}/status`)
        .send({ status: 'confirmed' })
        .expect(400);
    });
  });

  describe('shipping', () => {
    it('records tracking details and validates the URL', async () => {
      const order = await placeOrder();

      const response = await asAdmin('patch', `/api/admin/orders/${order.id}/shipping`)
        .send({
          provider: 'Delhivery',
          trackingNumber: 'DLV-999',
          trackingUrl: 'https://track.example.com/DLV-999',
          note: 'Picked up at 6pm',
        })
        .expect(200);

      expect(response.body.data.shipping).toMatchObject({
        provider: 'Delhivery',
        trackingNumber: 'DLV-999',
      });
      expect(response.body.data.shipping.notes).toHaveLength(1);

      await asAdmin('patch', `/api/admin/orders/${order.id}/shipping`)
        .send({ trackingUrl: 'not-a-url' })
        .expect(400);
    });
  });

  describe('payment', () => {
    it('records a manual payment once', async () => {
      const order = await placeOrder();

      const paid = await asAdmin('patch', `/api/admin/orders/${order.id}/payment`)
        .send({ status: 'paid', transactionId: 'UTR-1' })
        .expect(200);
      expect(paid.body.data.paymentStatus).toBe('paid');
      expect(paid.body.data.payment.paidAmount).toBe(order.total);

      await asAdmin('patch', `/api/admin/orders/${order.id}/payment`)
        .send({ status: 'paid', transactionId: 'UTR-2' })
        .expect(409);
    });
  });

  describe('cancellation', () => {
    it('restores stock once and refuses a duplicate cancellation', async () => {
      const order = await placeOrder(3);
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(7);

      const cancelled = await asAdmin('post', `/api/admin/orders/${order.id}/cancel`)
        .send({ reason: 'Customer requested cancellation' })
        .expect(200);

      expect(cancelled.body.data).toMatchObject({
        status: 'cancelled',
        canCancel: false,
      });
      expect(cancelled.body.data.cancellation).toMatchObject({ restocked: true });
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(10);

      await asAdmin('post', `/api/admin/orders/${order.id}/cancel`)
        .send({ reason: 'Again' })
        .expect(409);

      // Crucially: the duplicate attempt did not restock a second time.
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(10);
    });

    it('refuses to cancel a shipped order', async () => {
      const order = await placeOrder();

      for (const status of ['confirmed', 'processing', 'shipped']) {
        await asAdmin('patch', `/api/admin/orders/${order.id}/status`).send({ status }).expect(200);
      }

      await asAdmin('post', `/api/admin/orders/${order.id}/cancel`)
        .send({ reason: 'Too late' })
        .expect(409);
    });

    it('queues a refund obligation for a paid order', async () => {
      const order = await placeOrder();
      await asAdmin('patch', `/api/admin/orders/${order.id}/payment`)
        .send({ status: 'paid', transactionId: 'UTR-3' })
        .expect(200);

      const cancelled = await asAdmin('post', `/api/admin/orders/${order.id}/cancel`)
        .send({ reason: 'Out of stock' })
        .expect(200);

      expect(cancelled.body.data.paymentStatus).toBe('refund_pending');
      expect(cancelled.body.data.payment.refunds[0]).toMatchObject({ status: 'pending' });
      expect(cancelled.body.data.refundedAmount).toBe(0);
    });
  });

  describe('returns', () => {
    it('runs the full return workflow and restocks only after inspection', async () => {
      const order = await placeOrder(2);
      await deliver(order.id);

      const requested = await asCustomer('post', `/api/orders/${order.id}/returns`)
        .send({ reason: 'Defective unit', items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(201);

      const returnId = requested.body.data.activeReturn.returnId as string;
      expect(requested.body.data.status).toBe('return_requested');
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(8);

      await asAdmin('patch', `/api/admin/orders/${order.id}/returns/${returnId}`)
        .send({ action: 'approve' })
        .expect(200);
      await asAdmin('patch', `/api/admin/orders/${order.id}/returns/${returnId}`)
        .send({ action: 'receive' })
        .expect(200);

      const inspected = await asAdmin('patch', `/api/admin/orders/${order.id}/returns/${returnId}`)
        .send({ action: 'inspect', inspectionNotes: 'Seal intact', restockApproved: true })
        .expect(200);

      expect(inspected.body.data.activeReturn.status).toBe('restocked');
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(9);

      // Re-inspecting cannot restock twice.
      await asAdmin('patch', `/api/admin/orders/${order.id}/returns/${returnId}`)
        .send({ action: 'inspect', restockApproved: true })
        .expect(409);
      expect(products.all().find((product) => product.id === headphonesId)?.stock).toBe(9);

      const completed = await asAdmin('patch', `/api/admin/orders/${order.id}/returns/${returnId}`)
        .send({ action: 'complete' })
        .expect(200);
      expect(completed.body.data.status).toBe('returned');
    });

    it('rejects a return for an order that has not been delivered', async () => {
      const order = await placeOrder();

      await asCustomer('post', `/api/orders/${order.id}/returns`)
        .send({ reason: 'Changed my mind', items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(409);
    });
  });

  describe('refunds', () => {
    it('caps refunds and refuses to process the same refund twice', async () => {
      const order = await placeOrder();
      await asAdmin('patch', `/api/admin/orders/${order.id}/payment`)
        .send({ status: 'paid', transactionId: 'UTR-4' })
        .expect(200);

      const queued = await asAdmin('post', `/api/admin/orders/${order.id}/refunds`)
        .send({ amount: order.total, reason: 'Customer complaint' })
        .expect(201);
      const refundId = queued.body.data.payment.refunds[0].refundId as string;

      const processed = await asAdmin('patch', `/api/admin/orders/${order.id}/refunds/${refundId}`)
        .send({ status: 'processed', reference: 'RFND-1' })
        .expect(200);
      expect(processed.body.data.paymentStatus).toBe('refunded');
      expect(processed.body.data.refundedAmount).toBe(order.total);

      await asAdmin('patch', `/api/admin/orders/${order.id}/refunds/${refundId}`)
        .send({ status: 'processed' })
        .expect(409);

      await asAdmin('post', `/api/admin/orders/${order.id}/refunds`)
        .send({ amount: 1_000, reason: 'Extra' })
        .expect(409);
    });
  });

  describe('invoice', () => {
    it('is derived from the stored snapshot', async () => {
      const order = await placeOrder(2);

      const invoice = await asAdmin('get', `/api/admin/orders/${order.id}/invoice`).expect(200);
      expect(invoice.body.data).toMatchObject({
        invoiceNumber: `INV-${order.orderNumber}`,
        orderNumber: order.orderNumber,
      });
      expect(invoice.body.data.lines[0]).toMatchObject({
        sku: 'SKU-AU-1001',
        quantity: 2,
        unitPrice: 199_900,
      });
      expect(invoice.body.data.totals.total).toBe(order.total);

      // Editing the product must not change a historical invoice.
      await asAdmin('patch', `/api/admin/products/${headphonesId}`)
        .send({ name: 'Renamed Headphones', price: 999_900 })
        .expect(200);

      const reissued = await asAdmin('get', `/api/admin/orders/${order.id}/invoice`).expect(200);
      expect(reissued.body.data.lines[0].name).toBe('Wireless Headphones');
      expect(reissued.body.data.totals.total).toBe(order.total);
    });
  });

  describe('customer isolation', () => {
    it("returns 404 when a customer asks for someone else's order", async () => {
      const order = await placeOrder();

      await request(server())
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      const mine = await asCustomer('get', `/api/orders/${order.id}`).expect(200);
      expect(mine.body.data.id).toBe(order.id);
    });

    it('lists only the caller’s own orders', async () => {
      await placeOrder(1);
      await placeOrder(2, otherToken);

      const mine = await asCustomer('get', '/api/orders').expect(200);
      expect(mine.body.meta.total).toBe(1);
      expect(mine.body.data[0].customerEmail).toBe(CUSTOMER.email);
    });

    it('lets a customer cancel their own order but not another customer’s', async () => {
      const order = await placeOrder(1);

      await request(server())
        .post(`/api/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ reason: 'Not mine' })
        .expect(404);

      const cancelled = await asCustomer('post', `/api/orders/${order.id}/cancel`)
        .send({ reason: 'Changed my mind' })
        .expect(200);
      expect(cancelled.body.data.status).toBe('cancelled');
    });
  });

  describe('admin-created orders', () => {
    it('creates a manual order for a customer', async () => {
      const response = await asAdmin('post', '/api/admin/orders')
        .send({
          customerName: 'Walk-in Customer',
          customerEmail: 'walkin@example.com',
          customerPhone: '+91 90000 11111',
          items: [{ productId: headphonesId, quantity: 1 }],
          shippingAddress: { ...ADDRESS, recipientName: 'Walk-in Customer' },
          paymentMethod: 'manual',
        })
        .expect(201);

      expect(response.body.data.order).toMatchObject({
        customerEmail: 'walkin@example.com',
        paymentMethod: 'manual',
        status: 'pending',
      });
    });
  });
});
