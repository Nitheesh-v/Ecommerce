import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { FakeImageStorage } from './support/fake-image-storage.js';
import { FakePaymentGateway } from './support/fake-payment-gateway.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemoryCategoriesRepository } from './support/in-memory-categories.repository.js';
import { InMemoryCustomersRepository } from './support/in-memory-customers.repository.js';
import { InMemoryInventoryRepository } from './support/in-memory-inventory.repository.js';
import { InMemoryOrdersRepository } from './support/in-memory-orders.repository.js';
import { InMemoryPaymentEventsRepository } from './support/in-memory-payment-events.repository.js';
import { InMemoryPaymentsRepository } from './support/in-memory-payments.repository.js';
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-char-min';
  process.env.BCRYPT_ROUNDS = '4';
  // One suite issues many checkouts from the same IP; the limiter itself is
  // covered by its own e2e spec.
  process.env.THROTTLE_LIMIT = '10000';
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

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let ashaToken: string;
  let users: InMemoryUsersRepository;
  let orders: InMemoryOrdersRepository;
  let payments: InMemoryPaymentsRepository;
  let events: InMemoryPaymentEventsRepository;
  let gateway: FakePaymentGateway;
  let ashaId: string;
  let raviId: string;

  const server = () => app.getHttpServer();

  const asAdmin = (method: 'get' | 'post' | 'patch', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  const asAsha = (method: 'get' | 'post', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${ashaToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  function seedOrder(overrides: Parameters<InMemoryOrdersRepository['seed']>[0] = {}) {
    return orders.seed({
      userId: ashaId,
      customerName: 'Asha Rao',
      customerEmail: ASHA.email,
      status: 'pending',
      paymentStatus: 'pending',
      total: 100_000,
      paymentMethod: 'card',
      payment: { method: 'card', paidAmount: 0, refunds: [] },
      shippingAddress: ADDRESS,
      ...overrides,
    });
  }

  /** Starts a checkout and returns the gateway order id + local payment id. */
  async function startCheckout(orderId: string) {
    const response = await asAsha('post', '/api/payments/create-order')
      .send({ orderId })
      .expect(201);

    return response.body.data as {
      paymentId: string;
      gatewayOrderId: string;
      amount: number;
    };
  }

  function webhookPayload(
    type: string,
    entity: Record<string, unknown>,
    kind: 'payment' | 'refund' | 'order' = 'payment',
  ): string {
    return JSON.stringify({
      entity: 'event',
      event: type,
      payload: { [kind]: { entity } },
    });
  }

  function postWebhook(rawBody: string, signature: string, eventId: string) {
    return request(server())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .send(rawBody);
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
    payments = new InMemoryPaymentsRepository();
    events = new InMemoryPaymentEventsRepository();
    gateway = new FakePaymentGateway();

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
      payments,
      paymentEvents: events,
      paymentGateway: gateway,
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    ashaToken = await login(ASHA.email, ASHA.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    orders.reset();
    payments.reset();
    events.reset();
    gateway.reset();
    users.forceStatus(ashaId, 'active');
    users.forceStatus(raviId, 'active');
  });

  describe('authorization', () => {
    it('blocks anonymous access to checkout and the admin console', async () => {
      await request(server()).get('/api/admin/payments').expect(401);
      await request(server()).get('/api/admin/payments/summary').expect(401);
      await request(server()).post('/api/payments/create-order').send({ orderId: ashaId }).expect(401);
    });

    it('refuses customers on every admin payment route', async () => {
      const payment = payments.seed({ orderId: seedOrder().id });

      await asAsha('get', '/api/admin/payments').expect(403);
      await asAsha('get', '/api/admin/payments/summary').expect(403);
      await asAsha('get', `/api/admin/payments/${payment.id}`).expect(403);
      await asAsha('get', `/api/admin/payments/${payment.id}/history`).expect(403);
      await asAsha('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 1_000, reason: 'Nope' })
        .expect(403);
    });

    it('exposes only the publishable key in the public config', async () => {
      const response = await request(server()).get('/api/payments/config').expect(200);

      expect(response.body.data).toMatchObject({
        provider: 'razorpay',
        enabled: true,
        testMode: true,
        keyId: 'rzp_test_fake_key',
      });
      expect(JSON.stringify(response.body)).not.toContain('test-checkout-secret');
      expect(JSON.stringify(response.body)).not.toContain('test-webhook-secret');
    });
  });

  describe('checkout', () => {
    it('creates a gateway order for the stored order total, never a client amount', async () => {
      const order = seedOrder({ total: 250_000 });

      const response = await asAsha('post', '/api/payments/create-order')
        .send({ orderId: order.id })
        .expect(201);

      const session = response.body.data;
      expect(session).toMatchObject({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: 250_000,
        currency: 'INR',
        keyId: 'rzp_test_fake_key',
        testMode: true,
      });
      expect(session.gatewayOrderId).toMatch(/^order_test_/);

      const stored = payments.all()[0];
      expect(stored).toMatchObject({
        orderId: order.id,
        amount: 250_000,
        status: 'pending',
        gatewayOrderId: session.gatewayOrderId,
      });
    });

    it('rejects an amount supplied by the client (server-priced only)', async () => {
      const order = seedOrder({ total: 100_000 });

      await asAsha('post', '/api/payments/create-order')
        .send({ orderId: order.id, amount: 100 })
        .expect(400);
    });

    it("refuses another customer's order (404, so ids cannot be probed)", async () => {
      const order = seedOrder({ userId: raviId, customerEmail: RAVI.email });

      await asAsha('post', '/api/payments/create-order')
        .send({ orderId: order.id })
        .expect(404);
    });

    it('refuses to start a payment for an already-paid order', async () => {
      const order = seedOrder({
        paymentStatus: 'paid',
        payment: {
          method: 'card',
          paidAmount: 100_000,
          paidAt: new Date(),
          transactionId: 'pay_existing',
          refunds: [],
        },
      });

      await asAsha('post', '/api/payments/create-order')
        .send({ orderId: order.id })
        .expect(409);
    });

    it('reuses the open attempt instead of creating a second gateway order', async () => {
      const order = seedOrder();
      const first = await startCheckout(order.id);
      const second = await startCheckout(order.id);

      expect(second.gatewayOrderId).toBe(first.gatewayOrderId);
      expect(payments.all()).toHaveLength(1);
    });

    it('records a failed attempt when the gateway cannot create an order', async () => {
      const order = seedOrder();
      gateway.failNext = 'createOrder';

      await asAsha('post', '/api/payments/create-order')
        .send({ orderId: order.id })
        .expect(502);

      expect(payments.all()[0]).toMatchObject({
        status: 'failed',
        failureReason: expect.stringContaining('temporarily unavailable'),
      });
      expect(orders.findById(order.id)).toBeTruthy();
      expect((await orders.findById(order.id))?.paymentStatus).toBe('pending');
    });
  });

  describe('verification', () => {
    it('marks the payment and the order paid after a verified capture', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const gatewayPaymentId = 'pay_test_captured_1';

      gateway.registerPayment({
        id: gatewayPaymentId,
        orderId: session.gatewayOrderId,
        amount: session.amount,
        currency: 'INR',
        status: 'captured',
        method: 'upi',
      });

      const response = await asAsha('post', '/api/payments/verify')
        .send({
          gatewayOrderId: session.gatewayOrderId,
          gatewayPaymentId,
          signature: gateway.signCheckout(session.gatewayOrderId, gatewayPaymentId),
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        verified: true,
        status: 'captured',
        statusLabel: 'Captured',
      });

      const storedOrder = await orders.findById(order.id);
      expect(storedOrder?.paymentStatus).toBe('paid');
      expect(storedOrder?.payment.paidAmount).toBe(100_000);
      expect(storedOrder?.payment.transactionId).toBe(gatewayPaymentId);
      expect(storedOrder?.payment.method).toBe('upi');

      const storedPayment = payments.all()[0];
      expect(storedPayment).toMatchObject({
        status: 'captured',
        gatewayPaymentId,
        signatureVerified: true,
        verifiedWithGateway: true,
      });
    });

    it('rejects an invalid signature and leaves the payment pending', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);

      await asAsha('post', '/api/payments/verify')
        .send({
          gatewayOrderId: session.gatewayOrderId,
          gatewayPaymentId: 'pay_test_forged',
          signature: 'deadbeef'.repeat(8),
        })
        .expect(400);

      expect(payments.all()[0].status).toBe('pending');
      expect((await orders.findById(order.id))?.paymentStatus).toBe('pending');
      expect(events.all().some((event) => event.type === 'checkout.signature_invalid')).toBe(true);
    });

    it('rejects a capture whose amount does not match the order total', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const gatewayPaymentId = 'pay_test_short';

      gateway.registerPayment({
        id: gatewayPaymentId,
        orderId: session.gatewayOrderId,
        amount: 1,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      });

      await asAsha('post', '/api/payments/verify')
        .send({
          gatewayOrderId: session.gatewayOrderId,
          gatewayPaymentId,
          signature: gateway.signCheckout(session.gatewayOrderId, gatewayPaymentId),
        })
        .expect(400);

      expect(payments.all()[0].status).toBe('pending');
      expect((await orders.findById(order.id))?.paymentStatus).toBe('pending');
    });

    it('is idempotent when the callback is replayed', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const gatewayPaymentId = 'pay_test_replay';

      gateway.registerPayment({
        id: gatewayPaymentId,
        orderId: session.gatewayOrderId,
        amount: session.amount,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      });

      const payload = {
        gatewayOrderId: session.gatewayOrderId,
        gatewayPaymentId,
        signature: gateway.signCheckout(session.gatewayOrderId, gatewayPaymentId),
      };

      await asAsha('post', '/api/payments/verify').send(payload).expect(200);
      const replay = await asAsha('post', '/api/payments/verify').send(payload).expect(200);

      expect(replay.body.data.status).toBe('captured');

      const storedOrder = await orders.findById(order.id);
      const paymentEntries = storedOrder?.history.filter((entry) => entry.kind === 'payment') ?? [];
      expect(paymentEntries).toHaveLength(1);
      expect(storedOrder?.payment.paidAmount).toBe(100_000);
    });
  });

  describe('webhooks', () => {
    it('applies payment.captured exactly like a verified callback', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const rawBody = webhookPayload('payment.captured', {
        id: 'pay_webhook_1',
        order_id: session.gatewayOrderId,
        amount: 100_000,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      });

      const response = await postWebhook(rawBody, gateway.signWebhook(rawBody), 'evt_1').expect(200);

      expect(response.body.data).toMatchObject({ received: true, duplicate: false, handled: true });
      expect(payments.all()[0]).toMatchObject({
        status: 'captured',
        gatewayPaymentId: 'pay_webhook_1',
        verifiedWithGateway: true,
      });
      expect((await orders.findById(order.id))?.paymentStatus).toBe('paid');
    });

    it('processes a repeated delivery once (idempotent by event id)', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const rawBody = webhookPayload('payment.captured', {
        id: 'pay_webhook_dup',
        order_id: session.gatewayOrderId,
        amount: 100_000,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      });
      const signature = gateway.signWebhook(rawBody);

      await postWebhook(rawBody, signature, 'evt_dup').expect(200);
      const second = await postWebhook(rawBody, signature, 'evt_dup').expect(200);

      expect(second.body.data).toMatchObject({ duplicate: true, handled: false });

      const storedOrder = await orders.findById(order.id);
      expect(storedOrder?.history.filter((entry) => entry.kind === 'payment')).toHaveLength(1);
    });

    it('rejects a webhook with an invalid signature', async () => {
      const rawBody = webhookPayload('payment.captured', {
        id: 'pay_forged',
        order_id: 'order_unknown',
        amount: 1,
        status: 'captured',
      });

      await postWebhook(rawBody, 'not-a-signature', 'evt_forged').expect(400);
      expect(events.all()).toHaveLength(0);
    });

    it('marks an authorized payment without touching the order', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const rawBody = webhookPayload('payment.authorized', {
        id: 'pay_authorized_1',
        order_id: session.gatewayOrderId,
        amount: 100_000,
        status: 'authorized',
      });

      await postWebhook(rawBody, gateway.signWebhook(rawBody), 'evt_auth').expect(200);

      expect(payments.all()[0]).toMatchObject({
        status: 'authorized',
        gatewayPaymentId: 'pay_authorized_1',
      });
      expect((await orders.findById(order.id))?.paymentStatus).toBe('pending');
    });

    it('marks a failed payment failed while the order stays payable', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const rawBody = webhookPayload('payment.failed', {
        id: 'pay_failed_1',
        order_id: session.gatewayOrderId,
        amount: 100_000,
        status: 'failed',
        error_description: 'Card declined by the issuer',
      });

      await postWebhook(rawBody, gateway.signWebhook(rawBody), 'evt_fail').expect(200);

      expect(payments.all()[0]).toMatchObject({
        status: 'failed',
        failureReason: 'Card declined by the issuer',
      });
      expect((await orders.findById(order.id))?.paymentStatus).toBe('pending');
      expect((await orders.findById(order.id))?.status).toBe('pending');
    });
  });

  describe('refunds', () => {
    async function capturedPayment() {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const gatewayPaymentId = `pay_${order.id}`;

      gateway.registerPayment({
        id: gatewayPaymentId,
        orderId: session.gatewayOrderId,
        amount: session.amount,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      });

      await asAsha('post', '/api/payments/verify')
        .send({
          gatewayOrderId: session.gatewayOrderId,
          gatewayPaymentId,
          signature: gateway.signCheckout(session.gatewayOrderId, gatewayPaymentId),
        })
        .expect(200);

      return { order, payment: payments.all()[0] };
    }

    it('refunds the full amount and marks both records refunded', async () => {
      const { order, payment } = await capturedPayment();

      const response = await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 100_000, reason: 'Customer cancelled before shipping' })
        .expect(201);

      expect(response.body.data.refund).toMatchObject({
        amount: 100_000,
        status: 'processed',
        source: 'gateway',
      });
      expect(response.body.data.refund.gatewayRefundId).toMatch(/^rfnd_test_/);
      expect(response.body.data.payment.status).toBe('refunded');

      const storedOrder = await orders.findById(order.id);
      expect(storedOrder?.paymentStatus).toBe('refunded');
      expect(storedOrder?.payment.refunds[0]).toMatchObject({
        status: 'processed',
        source: 'gateway',
      });
      expect(payments.all()[0].status).toBe('refunded');
      expect(payments.all()[0].refundedAmount).toBe(100_000);
    });

    it('supports partial refunds and keeps the remainder refundable', async () => {
      const { order, payment } = await capturedPayment();

      const response = await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 40_000, reason: 'One item damaged' })
        .expect(201);

      expect(response.body.data.payment.status).toBe('partially_refunded');
      expect(response.body.data.payment.refundableAmount).toBe(60_000);

      const storedOrder = await orders.findById(order.id);
      expect(storedOrder?.paymentStatus).toBe('partially_refunded');
      expect(payments.all()[0]).toMatchObject({
        status: 'partially_refunded',
        refundedAmount: 40_000,
      });
    });

    it('prevents a second refund beyond what was captured', async () => {
      const { payment } = await capturedPayment();

      await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 100_000, reason: 'Full refund' })
        .expect(201);

      await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 1_000, reason: 'Double refund attempt' })
        .expect(409);
    });

    it('refuses a refund while another refund is pending', async () => {
      const { order, payment } = await capturedPayment();

      // Queued from the orders console (an offline refund awaiting confirmation).
      await asAdmin('post', `/api/admin/orders/${order.id}/refunds`)
        .send({ amount: 10_000, reason: 'Bank transfer in progress' })
        .expect(201);

      await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 10_000, reason: 'Second attempt' })
        .expect(409);
    });

    it('refuses more than the remaining refundable amount', async () => {
      const { payment } = await capturedPayment();

      await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 150_000, reason: 'Too much' })
        .expect(400);
    });

    it('refuses to refund a payment that never captured', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      const pending = payments.all()[0];

      expect(session.gatewayOrderId).toBe(pending.gatewayOrderId);

      await asAdmin('post', `/api/admin/payments/${pending.id}/refund`)
        .send({ amount: 1_000, reason: 'Nothing captured' })
        .expect(409);
    });

    it('finalises a gateway refund through the refund.processed webhook', async () => {
      const { order, payment } = await capturedPayment();

      gateway.refundStatus = 'pending';
      await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 25_000, reason: 'Partial, settling at gateway' })
        .expect(201);

      const refund = (await orders.findById(order.id))?.payment.refunds.at(-1);
      expect(refund?.status).toBe('pending');
      expect(refund?.gatewayRefundId).toMatch(/^rfnd_test_/);

      const rawBody = webhookPayload(
        'refund.processed',
        {
          id: refund?.gatewayRefundId,
          payment_id: payment.gatewayPaymentId,
          amount: 25_000,
          status: 'processed',
        },
        'refund',
      );

      await postWebhook(rawBody, gateway.signWebhook(rawBody), 'evt_refund_1').expect(200);

      const finalOrder = await orders.findById(order.id);
      expect(finalOrder?.paymentStatus).toBe('partially_refunded');
      expect(finalOrder?.payment.refunds.at(-1)?.status).toBe('processed');
      expect(payments.all()[0].status).toBe('partially_refunded');
    });

    it('marks the refund failed when the gateway rejects it', async () => {
      const { order, payment } = await capturedPayment();
      gateway.failNext = 'refund';

      await asAdmin('post', `/api/admin/payments/${payment.id}/refund`)
        .send({ amount: 10_000, reason: 'Will be rejected' })
        .expect(502);

      const storedOrder = await orders.findById(order.id);
      expect(storedOrder?.payment.refunds.at(-1)?.status).toBe('failed');
      // A failed refund leaves the money where it was.
      expect(storedOrder?.paymentStatus).toBe('paid');
      expect(storedOrder?.payment.paidAmount).toBe(100_000);
    });
  });

  describe('admin console', () => {
    function seedPayment(overrides: Parameters<InMemoryPaymentsRepository['seed']>[0]) {
      return payments.seed(overrides);
    }

    /** Seeds a transaction that mirrors its order's identity fields. */
    function seedPaymentFor(
      order: ReturnType<typeof seedOrder>,
      overrides: Partial<Parameters<InMemoryPaymentsRepository['seed']>[0]> = {},
    ) {
      return payments.seed({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        ...overrides,
      });
    }

    it('lists transactions with pagination metadata', async () => {
      const order = seedOrder();
      seedPayment({ orderId: order.id, status: 'captured' });
      seedPayment({ orderId: order.id, status: 'failed' });

      const response = await asAdmin('get', '/api/admin/payments').expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toMatchObject({ page: 1, limit: 20, total: 2 });
    });

    it('filters by status, method and free-text search', async () => {
      const order = seedOrder({ orderNumber: 'ORD-20260101-0042' });
      seedPaymentFor(order, { orderId: order.id, status: 'captured', method: 'upi' });
      seedPaymentFor(order, { orderId: order.id, status: 'failed', method: 'card' });

      const captured = await asAdmin('get', '/api/admin/payments?status=captured').expect(200);
      expect(captured.body.data).toHaveLength(1);
      expect(captured.body.data[0].method).toBe('upi');

      const byMethod = await asAdmin('get', '/api/admin/payments?method=card').expect(200);
      expect(byMethod.body.data).toHaveLength(1);

      const search = await asAdmin('get', '/api/admin/payments?search=0042').expect(200);
      expect(search.body.data).toHaveLength(2);
    });

    it('rejects an unknown status filter', async () => {
      await asAdmin('get', '/api/admin/payments?status=paid').expect(400);
    });

    it('summarises totals, successful, pending, failed and refunded amounts', async () => {
      const order = seedOrder();
      seedPayment({ orderId: order.id, amount: 100_000, status: 'captured', refundedAmount: 25_000 });
      seedPayment({ orderId: order.id, amount: 50_000, status: 'pending' });
      seedPayment({ orderId: order.id, amount: 30_000, status: 'failed' });

      const response = await asAdmin('get', '/api/admin/payments/summary').expect(200);

      expect(response.body.data).toMatchObject({
        totalCount: 3,
        totalAmount: 180_000,
        successfulCount: 1,
        successfulAmount: 100_000,
        pendingCount: 1,
        pendingAmount: 50_000,
        failedCount: 1,
        failedAmount: 30_000,
        refundedAmount: 25_000,
      });
    });

    it('returns transaction detail with order, customer, refunds and events', async () => {
      const order = seedOrder();
      const payment = seedPaymentFor(order, {
        orderId: order.id,
        status: 'captured',
        capturedAt: new Date(),
        gatewayPaymentId: 'pay_detail_1',
      });

      const response = await asAdmin('get', `/api/admin/payments/${payment.id}`).expect(200);
      const detail = response.body.data;

      expect(detail).toMatchObject({
        id: payment.id,
        orderNumber: order.orderNumber,
        status: 'captured',
        customer: { email: ASHA.email, name: 'Asha Rao' },
        order: { id: order.id, status: 'pending', statusLabel: 'Pending' },
      });
      expect(detail.events).toEqual([]);
      expect(detail.refunds).toEqual([]);
      expect(JSON.stringify(detail)).not.toContain('test-checkout-secret');
    });

    it('returns the event history for a payment', async () => {
      const order = seedOrder();
      const session = await startCheckout(order.id);
      gateway.registerPayment({
        id: 'pay_history_1',
        orderId: session.gatewayOrderId,
        amount: session.amount,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      });
      await asAsha('post', '/api/payments/verify')
        .send({
          gatewayOrderId: session.gatewayOrderId,
          gatewayPaymentId: 'pay_history_1',
          signature: gateway.signCheckout(session.gatewayOrderId, 'pay_history_1'),
        })
        .expect(200);

      const response = await asAdmin('get', `/api/admin/payments/${session.paymentId}/history`).expect(200);

      expect(response.body.data.events.map((event: { type: string }) => event.type)).toEqual(
        expect.arrayContaining(['payment.order_created', 'checkout.verified']),
      );
      expect(response.body.data.timeline.length).toBeGreaterThan(0);
    });

    it('answers 404 for an unknown payment id', async () => {
      await asAdmin('get', '/api/admin/payments/64b7f1c2a1b2c3d4e5f60000').expect(404);
      await asAdmin('get', '/api/admin/payments/not-an-id').expect(404);
    });
  });

  describe('manual payment recording', () => {
    it('refuses to record a card payment by hand', async () => {
      const order = seedOrder({ paymentMethod: 'card' });

      await asAdmin('patch', `/api/admin/orders/${order.id}/payment`)
        .send({ status: 'paid', transactionId: 'bank-1234' })
        .expect(400);

      expect((await orders.findById(order.id))?.paymentStatus).toBe('pending');
    });

    it('records a cash-on-delivery collection with a reference', async () => {
      const order = seedOrder({
        paymentMethod: 'cod',
        payment: { method: 'cod', paidAmount: 0, refunds: [] },
      });

      await asAdmin('patch', `/api/admin/orders/${order.id}/payment`)
        .send({ status: 'paid', transactionId: 'cod-receipt-1' })
        .expect(200);

      const stored = await orders.findById(order.id);
      expect(stored?.paymentStatus).toBe('paid');
      expect(stored?.payment.transactionId).toBe('cod-receipt-1');
    });

    it('requires a reference for an offline payment', async () => {
      const order = seedOrder({ paymentMethod: 'cod' });

      await asAdmin('patch', `/api/admin/orders/${order.id}/payment`)
        .send({ status: 'paid' })
        .expect(400);
    });
  });
});
